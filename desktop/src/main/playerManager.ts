import { EventEmitter } from 'node:events';
import { app, session, WebContentsView, type BaseWindow, type Rectangle } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { CellBounds, Player, PlayerMetrics, PlayerRuntimeState } from '@shared/types';
import { Store } from './store';

const DEFAULT_URL = 'about:blank';
const HIDDEN_BOUNDS: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
const MAX_AUTO_RELAUNCH_ATTEMPTS = 5;
const AUTO_RELAUNCH_BASE_DELAY_MS = 1000;
const AUTO_RELAUNCH_MAX_DELAY_MS = 16000;

/**
 * Single source of truth for player state. Owns every guest WebContentsView's
 * lifecycle (create/attach/reposition/destroy) and its session partition.
 * The renderer never mutates this state directly — it reflects it via IPC.
 *
 * Guest views are attached via contentView.addChildView(), which always stacks
 * them above the shell renderer's own DOM layer — there is no z-index to sort
 * against. Renderer-drawn overlays (dialogs, modals) must ask via
 * setOverlayVisible() to have every guest view hidden while they're open.
 * A crashed/errored player's own body area works the same way (see
 * setPlayerError()) - its view is hidden so the renderer's error card, drawn
 * underneath where the WebContentsView normally sits, becomes visible.
 */
export class PlayerManager extends EventEmitter {
    private readonly store = new Store();
    private readonly views = new Map<string, WebContentsView>();
    private readonly lastBounds = new Map<string, Rectangle>();
    private readonly runtimeState = new Map<string, PlayerRuntimeState>();
    private readonly erroredIds = new Set<string>();
    private readonly relaunchAttempts = new Map<string, number>();
    private readonly relaunchTimers = new Map<string, NodeJS.Timeout>();
    private overlayVisible = false;

    public constructor(private readonly shell: BaseWindow) {
        super();
    }

    public create(url?: string, userAgent?: string, env?: string, license?: string, instanceName?: string): Player {
        const id = uuidv4();
        const partition = `persist:player-${id}`;
        const targetUrl = url && url.trim().length > 0 ? url.trim() : DEFAULT_URL;
        const player: Player = { id, url: targetUrl, partition, muted: false, userAgent, env, license, instanceName };

        this.attachView(player);
        this.store.add(player);
        this.emitChanged();

        return player;
    }

    /**
     * Creates `count` players from the same url, staggered ~150ms apart
     * (INITPROJECT.md §6: "Creating 10 players must not block the UI thread
     * — stagger instantiation"). Each attachView() call itself is cheap/sync,
     * but this still spreads the WebContentsView construction + initial
     * loadURL calls out instead of firing all of them in the same tick.
     */
    public async createMany(count: number, url?: string): Promise<void> {
        for (let i = 0; i < count; i++) {
            this.create(url);
            if (i < count - 1) await delay(150);
        }
    }

    /**
     * Recreates every player persisted from a previous run (Phase 3 -
     * "Persist layout"), reusing each one's exact id/partition rather than
     * generating fresh ones - that's what makes Chromium reattach the same
     * cookies/localStorage already sitting on disk under that partition
     * instead of starting each one over blank. Store's constructor already
     * loaded these from settings.json, so this only needs to attach a real
     * WebContentsView for each - no store.add() (already there) or
     * emitChanged() (nothing changed yet from the renderer's perspective;
     * its own listPlayers() call picks these up once it asks).
     */
    public restoreAll(): void {
        for (const player of this.store.list()) {
            this.attachView(player);
        }
    }

    /** Builds and attaches a guest WebContentsView for an already-known player. */
    private attachView(player: Player): void {
        const view = new WebContentsView({
            webPreferences: {
                partition: player.partition,
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
            },
        });

        // Throttle offscreen/backgrounded work (timers, rAF) - one of the
        // performance constraints (INITPROJECT.md §6) that costs nothing to
        // always have on, unlike the visual zero-bounds hide used for
        // scrolled-out thumbnails, which doesn't throttle anything by itself.
        view.webContents.setBackgroundThrottling(true);

        if (player.userAgent) view.webContents.setUserAgent(player.userAgent);
        if (player.muted) view.webContents.setAudioMuted(true);

        // Hidden until the renderer reports this player's grid-cell bounds.
        view.setBounds(HIDDEN_BOUNDS);
        this.shell.contentView.addChildView(view);
        void view.webContents.loadURL(player.url);

        this.views.set(player.id, view);
        this.runtimeState.set(player.id, {
            id: player.id,
            loading: true,
            error: null,
            canGoBack: false,
            canGoForward: false,
            recovering: false,
        });
        this.attachWatchdog(player.id, view);
    }

    /** Wires the crash/loading/navigation listeners that keep runtimeState (and the persisted url) current. */
    private attachWatchdog(id: string, view: WebContentsView): void {
        const wc = view.webContents;

        const patchState = (patch: Partial<PlayerRuntimeState>): void => {
            const current = this.runtimeState.get(id);
            if (!current) return;
            this.runtimeState.set(id, { ...current, ...patch });
            this.emitStateChanged();
        };

        wc.on('did-start-loading', () => patchState({ loading: true }));
        wc.on('did-stop-loading', () => {
            patchState({
                loading: false,
                canGoBack: wc.navigationHistory.canGoBack(),
                canGoForward: wc.navigationHistory.canGoForward(),
            });
        });

        wc.on('did-navigate', (_event, navigatedUrl) => {
            this.store.update(id, { url: navigatedUrl });
            this.relaunchAttempts.delete(id); // a real successful navigation resets the crash-backoff counter
            this.clearPlayerError(id);
            this.emitChanged();
        });
        wc.on('did-navigate-in-page', (_event, navigatedUrl) => {
            this.store.update(id, { url: navigatedUrl });
            this.emitChanged();
        });

        wc.on('did-fail-load', (_event, errorCode, errorDescription, _validatedUrl, isMainFrame) => {
            // -3 is ERR_ABORTED - fires constantly on ordinary redirects/
            // cancelled navigations, not a real failure worth surfacing.
            if (!isMainFrame || errorCode === -3) return;
            this.setPlayerError(id, `Failed to load: ${errorDescription || errorCode}`);
        });

        wc.on('unresponsive', () => this.setPlayerError(id, 'Page is not responding.'));
        wc.on('responsive', () => this.clearPlayerError(id));

        wc.on('render-process-gone', (_event, details) => {
            if (details.reason === 'clean-exit') return;
            this.setPlayerError(id, `Player crashed (${details.reason}).`);
            this.scheduleAutoRelaunch(id);
        });
    }

    private setPlayerError(id: string, message: string): void {
        this.erroredIds.add(id);
        const current = this.runtimeState.get(id);
        if (current) {
            this.runtimeState.set(id, { ...current, loading: false, error: message });
            this.emitStateChanged();
        }
        // Hide the crashed/failed view so the renderer's own error card
        // (drawn in the same spot) is what's actually visible - same
        // technique as setOverlayVisible(), just scoped to one player.
        const view = this.views.get(id);
        if (view) view.setBounds(HIDDEN_BOUNDS);
    }

    private clearPlayerError(id: string): void {
        if (!this.erroredIds.has(id)) return;
        this.erroredIds.delete(id);
        const timer = this.relaunchTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            this.relaunchTimers.delete(id);
        }

        const current = this.runtimeState.get(id);
        if (current) {
            this.runtimeState.set(id, { ...current, error: null, recovering: false });
            this.emitStateChanged();
        }

        // Restore whatever bounds this player last had, rather than waiting
        // for the next grid resize/report cycle to make it visible again.
        if (!this.overlayVisible) {
            const bounds = this.lastBounds.get(id);
            const view = this.views.get(id);
            if (view && bounds) view.setBounds(bounds);
        }
    }

    /** Flips the runtime `recovering` flag, which the card renders as a distinct status from a plain terminal error. */
    private patchRecovering(id: string, recovering: boolean): void {
        const current = this.runtimeState.get(id);
        if (!current || current.recovering === recovering) return;
        this.runtimeState.set(id, { ...current, recovering });
        this.emitStateChanged();
    }

    /** Capped exponential backoff (INITPROJECT.md §3: "cap the retries — never loop infinitely"). */
    private scheduleAutoRelaunch(id: string): void {
        const attempt = this.relaunchAttempts.get(id) ?? 0;
        if (attempt >= MAX_AUTO_RELAUNCH_ATTEMPTS) {
            // Retry budget spent - stays errored, only a manual Reload can
            // recover it now. Drop `recovering` so the card stops promising a
            // retry that will never come and shows plain Error instead.
            this.patchRecovering(id, false);
            return;
        }

        this.relaunchAttempts.set(id, attempt + 1);
        this.patchRecovering(id, true);
        const delayMs = Math.min(AUTO_RELAUNCH_BASE_DELAY_MS * 2 ** attempt, AUTO_RELAUNCH_MAX_DELAY_MS);

        const timer = setTimeout(() => {
            this.relaunchTimers.delete(id);
            const view = this.views.get(id);
            const player = this.store.get(id);
            if (view && player) void view.webContents.loadURL(player.url);
        }, delayMs);
        this.relaunchTimers.set(id, timer);
    }

    public navigate(id: string, url: string): void {
        const view = this.views.get(id);
        const target = url.trim();
        if (!view || target.length === 0) return;
        void view.webContents.loadURL(target);
    }

    public goBack(id: string): void {
        const view = this.views.get(id);
        if (view?.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack();
    }

    public goForward(id: string): void {
        const view = this.views.get(id);
        if (view?.webContents.navigationHistory.canGoForward()) view.webContents.navigationHistory.goForward();
    }

    /** Also the recovery action for a crashed/errored player - clears its error state and reloads. */
    public reload(id: string): void {
        this.clearPlayerError(id);
        this.relaunchAttempts.delete(id);
        this.views.get(id)?.webContents.reload();
    }

    public reloadAll(): void {
        for (const id of this.views.keys()) this.reload(id);
    }

    public stopLoading(id: string): void {
        this.views.get(id)?.webContents.stop();
    }

    public setMuted(id: string, muted: boolean): void {
        this.views.get(id)?.webContents.setAudioMuted(muted);
        this.store.update(id, { muted });
        this.emitChanged();
    }

    public setAllMuted(muted: boolean): void {
        for (const id of this.views.keys()) this.setMuted(id, muted);
    }

    public openDevTools(id: string): void {
        const view = this.views.get(id);
        if (!view) return;
        if (view.webContents.isDevToolsOpened()) view.webContents.closeDevTools();
        else view.webContents.openDevTools({ mode: 'detach' });
    }

    public rename(id: string, label: string): void {
        this.store.update(id, { label: label.trim() || undefined });
        this.emitChanged();
    }

    public async getMetrics(): Promise<Record<string, PlayerMetrics>> {
        const metricsByPid = new Map<number, Electron.ProcessMetric>();
        for (const metric of app.getAppMetrics()) {
            metricsByPid.set(metric.pid, metric);
        }

        const result: Record<string, PlayerMetrics> = {};
        for (const [id, view] of this.views) {
            const pid = view.webContents.getOSProcessId();
            const metric = metricsByPid.get(pid);
            if (!metric) continue;
            result[id] = {
                cpuPercent: metric.cpu.percentCPUUsage,
                memoryMB: metric.memory.workingSetSize / 1024,
            };
        }
        return result;
    }

    public async remove(id: string, purge: boolean): Promise<boolean> {
        const view = this.views.get(id);
        const player = this.store.get(id);
        if (!view || !player) return false;

        const timer = this.relaunchTimers.get(id);
        if (timer) clearTimeout(timer);
        this.relaunchTimers.delete(id);
        this.relaunchAttempts.delete(id);
        this.erroredIds.delete(id);
        this.runtimeState.delete(id);

        this.shell.contentView.removeChildView(view);
        view.webContents.close();
        this.views.delete(id);
        this.lastBounds.delete(id);
        this.store.remove(id);

        if (purge) {
            await session.fromPartition(player.partition).clearStorageData();
        }

        this.emitChanged();
        this.emitStateChanged();
        return true;
    }

    public list(): Player[] {
        return this.store.list();
    }

    public listRuntimeState(): PlayerRuntimeState[] {
        return Array.from(this.runtimeState.values());
    }

    public applyBounds(cells: CellBounds[]): void {
        for (const cell of cells) {
            const bounds: Rectangle = {
                x: Math.round(cell.x),
                y: Math.round(cell.y),
                width: Math.round(cell.width),
                height: Math.round(cell.height),
            };

            this.lastBounds.set(cell.playerId, bounds);

            const view = this.views.get(cell.playerId);
            if (view && !this.overlayVisible && !this.erroredIds.has(cell.playerId)) view.setBounds(bounds);
        }
    }

    /** Hides (or restores) every guest view so a renderer-drawn overlay can be seen above them. */
    public setOverlayVisible(visible: boolean): void {
        this.overlayVisible = visible;

        for (const [id, view] of this.views) {
            if (visible || this.erroredIds.has(id)) {
                view.setBounds(HIDDEN_BOUNDS);
            } else {
                const bounds = this.lastBounds.get(id);
                if (bounds) view.setBounds(bounds);
            }
        }
    }

    private emitChanged(): void {
        this.emit('changed', this.list());
    }

    private emitStateChanged(): void {
        this.emit('state-changed', this.listRuntimeState());
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
