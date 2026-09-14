import { Component, computed, effect, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button, Input as PantryInput, Modal, Textarea } from '@ntv360/component-pantry';
import type {
    BuildProgressEvent,
    Player,
    PlayerMetrics,
    PlayerRuntimeState,
    ToolbarMenuActionEvent,
    ToolbarMenuContext,
    ToolbarMenuKind,
} from '@shared/types';
import { GridComponent } from './grid.component';

type ModalMode = 'url' | 'instance' | 'quick';

@Component({
    selector: 'app-root',
    imports: [FormsModule, GridComponent, Button, PantryInput, Modal, Textarea],
    template: `
        <div class="toolbar">
            <div class="toolbar__group">
                <ntv-button variant="primary" (buttonClick)="openModal()">+ Add player</ntv-button>
                @if (focusedPlayerId()) {
                    <ntv-button variant="secondary" size="xs" (buttonClick)="focusedPlayerId.set(null)"
                        >← Back to grid</ntv-button
                    >
                }
            </div>

            @if (players().length > 0) {
                <div class="toolbar__divider"></div>
                <div class="toolbar__group">
                    <ntv-button variant="secondary" size="sm" (buttonClick)="openActionsMenu($event)"
                        >Actions ▾</ntv-button
                    >

                    <ntv-button variant="danger" size="sm" (buttonClick)="openRemoveMenu($event)">
                        🗑 Remove
                        @if (selectedIds().size > 0) {
                            <span class="toolbar-menu__badge">{{ selectedIds().size }}</span>
                        }
                        ▾
                    </ntv-button>
                </div>
            }

            <div class="toolbar__spacer"></div>

            <div class="toolbar__group">
                <label class="toolbar__columns-label">
                    Columns
                    <ntv-input
                        type="number"
                        size="xs"
                        placeholder="Auto"
                        [disabledInput]="focusedPlayerId() !== null"
                        [(ngModel)]="columnsText"
                        (ngModelChange)="onColumnsChange($event)" />
                </label>

                <div class="toolbar__divider"></div>

                <span class="toolbar__columns-label">Per page</span>
                @if (customPageSizeOpen()) {
                    <ntv-input
                        #customPageSizeInput
                        class="toolbar-custom-pagesize-input"
                        type="number"
                        size="xs"
                        placeholder="Per page"
                        [minValue]="1"
                        [(ngModel)]="customPageSizeText"
                        (keydown.enter)="commitCustomPageSize()"
                        (keydown.escape)="cancelCustomPageSize()"
                        (blur)="commitCustomPageSize()" />
                } @else {
                    <ntv-button variant="secondary" size="sm" (buttonClick)="openPerPageMenu($event)">
                        {{ pageSize() ? pageSize() + ' / page' : 'Auto' }} ▾
                    </ntv-button>
                }

                @if (pageSize() && totalPages() > 1) {
                    <div class="toolbar-pagination">
                        <button
                            type="button"
                            class="toolbar-page-btn"
                            [disabled]="currentPage() === 0"
                            (click)="prevPage()">
                            ◀
                        </button>
                        <span class="toolbar__page-label">Page {{ currentPage() + 1 }} of {{ totalPages() }}</span>
                        <button
                            type="button"
                            class="toolbar-page-btn"
                            [disabled]="currentPage() >= totalPages() - 1"
                            (click)="nextPage()">
                            ▶
                        </button>
                    </div>
                }

                <div class="toolbar__divider"></div>

                <div class="toolbar-settings-trigger">
                    <ntv-button variant="secondary" size="sm" (buttonClick)="openSettingsMenu($event)">⚙</ntv-button>
                    <span class="toolbar-gear-dot" [class.toolbar-gear-dot--off]="gpuDisabled()"></span>
                </div>
            </div>
        </div>

        <div
            class="grid-mount"
            [class.grid-mount--drag-active]="dragActive()"
            [class.grid-mount--reserve-badge]="building() && !modalOpen()"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave($event)"
            (drop)="onDrop($event)">
            <player-grid
                [players]="players()"
                [columnOverride]="columnOverride()"
                [pageSize]="pageSize()"
                [currentPage]="currentPage()"
                [focusedPlayerId]="focusedPlayerId()"
                [selectedIds]="selectedIds()"
                [runtimeStates]="runtimeStates()"
                [metrics]="metrics()"
                (focusChange)="focusedPlayerId.set($event)"
                (toggleSelect)="onToggleSelect($event)"
                (remove)="onRemovePlayer($event)"
                (navigate)="onNavigate($event)"
                (goBack)="onGoBack($event)"
                (goForward)="onGoForward($event)"
                (reload)="onReloadPlayer($event)"
                (stop)="onStopPlayer($event)"
                (toggleMute)="onToggleMute($event)"
                (openDevTools)="onOpenDevTools($event)"
                (rename)="onRename($event)" />
            @if (dragActive()) {
                <div class="drop-overlay">
                    Drop a player-server + player-ui .zip (or a pi-image.img) to build a new instance
                </div>
            }
            @if (building() && !modalOpen()) {
                <div class="build-badge" [class.build-badge--error]="buildError()" (click)="reopenBuildProgress()">
                    @if (buildError()) {
                        <span>⚠ Build failed — click to view</span>
                    } @else {
                        <span class="build-badge__spinner"></span>
                        <span>{{ buildStatusText() }}…</span>
                    }
                </div>
            }
        </div>

        <ntv-modal [isVisible]="modalOpen()" [showHeader]="true" [showFooter]="true" (modalClose)="closeModal()">
            <div modal-header>
                <h2 class="modal-header__title">{{ building() ? buildStatusText() : 'Add Player' }}</h2>
            </div>

            @if (building()) {
                <div class="build-log">
                    @for (line of buildLog(); track $index) {
                        <div class="build-log__line">{{ line }}</div>
                    }
                </div>
                @if (buildError()) {
                    <p class="build-error">{{ buildError() }}</p>
                }
            } @else {
                <div class="mode-toggle">
                    <ntv-button
                        [variant]="mode() === 'url' ? 'primary' : 'secondary'"
                        size="xs"
                        (buttonClick)="setMode('url')">
                        Existing URL
                    </ntv-button>
                    <ntv-button
                        [variant]="mode() === 'quick' ? 'primary' : 'secondary'"
                        size="xs"
                        (buttonClick)="setMode('quick')">
                        Quick Instance
                    </ntv-button>
                    <ntv-button
                        [variant]="mode() === 'instance' ? 'primary' : 'secondary'"
                        size="xs"
                        (buttonClick)="setMode('instance')">
                        New Instance
                    </ntv-button>
                </div>

                @if (mode() === 'url') {
                    <div class="instance-form">
                        <ntv-input
                            #urlInput
                            type="text"
                            label="URL"
                            placeholder="https://example.com (blank = new tab)"
                            [(ngModel)]="urlModel" />
                        <ntv-input
                            type="number"
                            label="How many?"
                            placeholder="1"
                            [minValue]="1"
                            [maxValue]="20"
                            [(ngModel)]="addCountText" />
                        <!-- User-Agent field hidden from the UI for now (not deleted) - userAgentModel
                             stays wired in submitModal()/closeModal() so it's a one-line re-add later. -->
                    </div>
                } @else if (mode() === 'quick') {
                    <div class="instance-form">
                        <p class="instance-form__hint">
                            Creates another instance from the build already in ./extracted/ - no rebuild.
                        </p>
                        <ntv-input
                            type="number"
                            label="How many?"
                            placeholder="1"
                            [minValue]="1"
                            [maxValue]="20"
                            [(ngModel)]="quickCountText" />
                        <ntv-input type="text" label="Environment" placeholder="production" [(ngModel)]="envText" />
                        <ntv-textarea
                            label="License IDs"
                            placeholder="One per instance, one per line. Optional."
                            [(ngModel)]="quickLicensesText" />
                        @if (quickLicenseCount() > 0) {
                            <p
                                class="instance-form__hint"
                                [class.instance-form__hint--warning]="quickLicenseMismatch()">
                                {{ quickLicenseCount() }} license(s) for {{ parseQuickCount() }} instance(s)
                                @if (quickTooManyLicenses()) {
                                    — extra ones won't be used, lower the count or remove a line
                                } @else if (quickLicenseMismatch()) {
                                    — the rest will be created without a license
                                }
                            </p>
                        }
                    </div>
                } @else {
                    <div class="instance-form">
                        <div
                            class="instance-form__dropzone"
                            [class.instance-form__dropzone--active]="instanceDragActive()"
                            (dragover)="onInstanceDragOver($event)"
                            (dragleave)="onInstanceDragLeave($event)"
                            (drop)="onInstanceDrop($event)">
                            <div class="instance-form__field">
                                <span class="instance-form__label">player-server</span>
                                <ntv-button variant="secondary" [fullWidth]="true" (buttonClick)="pickServerZip()">
                                    {{ serverZipPath() ? fileName(serverZipPath()!) : 'Browse .zip…' }}
                                </ntv-button>
                            </div>
                            <div class="instance-form__field">
                                <span class="instance-form__label">player-ui</span>
                                <ntv-button variant="secondary" [fullWidth]="true" (buttonClick)="pickUiZip()">
                                    {{ uiZipPath() ? fileName(uiZipPath()!) : 'Browse .zip…' }}
                                </ntv-button>
                            </div>
                            <p class="instance-form__hint">
                                or drag both .zip files here at once (or a pi-image.img) — they're sorted automatically
                            </p>
                        </div>
                        <ntv-input type="text" label="Environment" placeholder="production" [(ngModel)]="envText" />
                        <ntv-input type="text" label="License ID" placeholder="Optional" [(ngModel)]="licenseText" />
                    </div>
                }
            }

            <div modal-footer>
                @if (building()) {
                    <ntv-button
                        [variant]="buildError() ? 'secondary' : 'info'"
                        [loading]="!buildError()"
                        (buttonClick)="closeModal()">
                        {{ buildError() ? 'Close' : buildStatusText() + '…' }}
                    </ntv-button>
                } @else {
                    <ntv-button variant="secondary" (buttonClick)="closeModal()">Cancel</ntv-button>
                    @if (mode() === 'url') {
                        <ntv-button variant="primary" (buttonClick)="submitModal()">Add</ntv-button>
                    } @else if (mode() === 'quick') {
                        <ntv-button
                            variant="primary"
                            [disabled]="quickTooManyLicenses()"
                            (buttonClick)="submitInstanceBuild()">
                            Add Instance
                        </ntv-button>
                    } @else {
                        <ntv-button
                            variant="primary"
                            [disabled]="!canBuildInstance()"
                            (buttonClick)="submitInstanceBuild()">
                            Build & Add
                        </ntv-button>
                    }
                }
            </div>
        </ntv-modal>
    `,
})
export class AppComponent {
    public readonly players = signal<Player[]>([]);
    public readonly columnOverride = signal<number | null>(null);
    public readonly pageSize = signal<number | null>(null);
    public readonly currentPage = signal(0);
    public readonly focusedPlayerId = signal<string | null>(null);
    public readonly selectedIds = signal<ReadonlySet<string>>(new Set());
    public readonly runtimeStates = signal<ReadonlyMap<string, PlayerRuntimeState>>(new Map());
    public readonly metrics = signal<ReadonlyMap<string, PlayerMetrics>>(new Map());
    public readonly gpuDisabled = signal(false);
    public readonly modalOpen = signal(false);
    public readonly mode = signal<ModalMode>('url');
    public readonly dragActive = signal(false);
    public readonly instanceDragActive = signal(false);
    public readonly customPageSizeOpen = signal(false);

    public readonly serverZipPath = signal<string | null>(null);
    public readonly uiZipPath = signal<string | null>(null);
    public readonly imagePath = signal<string | null>(null);
    public readonly building = signal(false);
    public readonly buildLog = signal<string[]>([]);
    public readonly buildError = signal<string | null>(null);
    public readonly buildBatch = signal<{ current: number; total: number } | null>(null);
    public readonly dockerRepoPath = signal<string | null>(null);

    public readonly buildStatusText = computed(() => {
        const batch = this.buildBatch();
        return batch ? `Building instance ${batch.current} of ${batch.total}` : 'Building instance';
    });

    public readonly totalPages = computed(() => {
        const size = this.pageSize();
        return size ? Math.max(1, Math.ceil(this.players().length / size)) : 1;
    });

    public readonly allMuted = computed(() => this.players().length > 0 && this.players().every((p) => p.muted));

    public columnsText = '';
    public urlModel = '';
    public envText = '';
    public licenseText = '';
    public quickLicensesText = '';
    public quickCountText = '1';
    public addCountText = '1';
    public userAgentModel = '';
    public customPageSizeText = '';

    private readonly urlInput = viewChild<PantryInput>('urlInput');
    private readonly customPageSizeInput = viewChild<PantryInput>('customPageSizeInput');
    private stopBuildProgress: (() => void) | null = null;
    private closingCustomPageSize = false;

    public constructor() {
        window.playerSwarm.onPlayersChanged((players) => this.onPlayersChanged(players));
        void window.playerSwarm.listPlayers().then((players) => this.onPlayersChanged(players));
        void window.playerSwarm.getDockerRepoPath().then((path) => this.dockerRepoPath.set(path));
        void window.playerSwarm.getGpuDisabled().then((disabled) => this.gpuDisabled.set(disabled));

        window.playerSwarm.onPlayerStateChanged((states) => {
            this.runtimeStates.set(new Map(states.map((s) => [s.id, s])));
        });

        window.playerSwarm.onToolbarMenuAction((event) => this.onToolbarMenuAction(event));

        // Pull-based rather than push-streamed - app.getAppMetrics() is cheap
        // enough to poll and avoids needing a per-metric-tick IPC event.
        setInterval(() => {
            void window.playerSwarm.getPlayerMetrics().then((metrics) => {
                this.metrics.set(new Map(Object.entries(metrics)));
            });
        }, 3000);

        // The Add Player modal is a big, centered, deliberately rare overlay -
        // hiding every player for it is the right call (a WebContentsView
        // always draws above the renderer's own DOM, so there's no CSS way
        // to make the modal visible over a player otherwise). The toolbar's
        // Actions/Remove/Settings/Per Page menus avoid that problem entirely
        // instead of working around it - see showMenu()'s own comment.
        effect(() => {
            window.playerSwarm.setOverlayVisible(this.modalOpen());
        });
    }

    public openActionsMenu(event: MouseEvent): void {
        this.showMenu('actions', event, { allMuted: this.allMuted() });
    }

    public reloadAll(): void {
        window.playerSwarm.reloadAllPlayers();
    }

    public toggleMuteAll(): void {
        window.playerSwarm.setAllPlayersMuted(!this.allMuted());
    }

    public openRemoveMenu(event: MouseEvent): void {
        this.showMenu('remove', event, { selectedCount: this.selectedIds().size });
    }

    public openSettingsMenu(event: MouseEvent): void {
        const path = this.dockerRepoPath();
        this.showMenu('settings', event, {
            gpuDisabled: this.gpuDisabled(),
            dockerRepoLabel: path ? this.fileName(path) : undefined,
        });
    }

    public onColumnsChange(value: string): void {
        const parsed = Number.parseInt(value, 10);
        this.columnOverride.set(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
    }

    public openPerPageMenu(event: MouseEvent): void {
        this.showMenu('perPage', event, { pageSize: this.pageSize() });
    }

    /**
     * Opens a native Electron menu anchored under the trigger button instead
     * of an HTML ntv-popover - a WebContentsView always stacks above the
     * renderer's own DOM (see playerManager.ts's header comment), so an HTML
     * dropdown can never actually draw over a player, only force it fully
     * hidden while overlapped (the old black-rectangle bug). A native Menu is
     * composited by the OS window manager instead, sitting above
     * WebContentsView with no stacking conflict at all - nothing needs to be
     * hidden. The button's own rect is already in the right coordinate space:
     * Menu.popup()'s x/y are relative to the window's content area, same as
     * getBoundingClientRect() here (see grid.component.ts's reportBounds()
     * for the same fact established for WebContentsView.setBounds()).
     */
    private showMenu(kind: ToolbarMenuKind, event: MouseEvent, context: ToolbarMenuContext): void {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        window.playerSwarm.showToolbarMenu({ kind, x: rect.left, y: rect.bottom, context });
    }

    /** Dispatches a clicked native menu item back to whichever existing method the old HTML popover item used to call directly - see showMenu()'s own comment for why the menu itself is native now. */
    private onToolbarMenuAction(event: ToolbarMenuActionEvent): void {
        switch (event.kind) {
            case 'actions':
                if (event.action === 'reloadAll') this.reloadAll();
                else if (event.action === 'toggleMuteAll') this.toggleMuteAll();
                break;
            case 'remove':
                if (event.action === 'removeSelected') void this.removeSelected();
                else if (event.action === 'removeAll') void this.removeAll();
                break;
            case 'settings':
                if (event.action === 'toggleGpu') this.toggleGpu();
                else if (event.action === 'chooseDockerRepoPath') void this.chooseDockerRepoPath();
                break;
            case 'perPage':
                if (event.action === 'setPageSize') {
                    this.pageSize.set(event.value ?? null);
                    this.currentPage.set(0); // avoid landing on a now out-of-range page
                } else if (event.action === 'customPageSize') {
                    this.openCustomPageSizeInput();
                }
                break;
        }
    }

    /**
     * "Custom…" in the Per Page menu - the native Menu item can't host a text
     * field itself, so it just tells the renderer to swap the Per Page button
     * for an inline ntv-input in the toolbar instead (safe from the usual
     * WebContentsView-stacking problem - the toolbar sits above grid-mount,
     * where players are bounded, so nothing can ever draw over this field).
     */
    private openCustomPageSizeInput(): void {
        this.customPageSizeText = this.pageSize() ? String(this.pageSize()) : '';
        this.customPageSizeOpen.set(true);
        setTimeout(() => this.customPageSizeInput()?.inputElement().nativeElement.focus());
    }

    /** Enter commits, then the resulting blur re-fires this - closingCustomPageSize makes that second call a no-op instead of reapplying (harmlessly) or racing the close. */
    public commitCustomPageSize(): void {
        if (this.closingCustomPageSize) return;
        this.closingCustomPageSize = true;

        const parsed = Number.parseInt(this.customPageSizeText, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            this.pageSize.set(parsed);
            this.currentPage.set(0);
        }
        this.customPageSizeOpen.set(false);
        setTimeout(() => (this.closingCustomPageSize = false));
    }

    /** Escape discards the typed value instead of applying it - same closingCustomPageSize guard as commitCustomPageSize() so the blur it triggers doesn't commit anyway. */
    public cancelCustomPageSize(): void {
        this.closingCustomPageSize = true;
        this.customPageSizeOpen.set(false);
        setTimeout(() => (this.closingCustomPageSize = false));
    }

    private onPlayersChanged(players: Player[]): void {
        this.players.set(players);
        // The focused player may have just been removed - fall back to grid
        // view rather than leaving a dangling reference to a player that no
        // longer exists.
        const focusedId = this.focusedPlayerId();
        if (focusedId && !players.some((p) => p.id === focusedId)) {
            this.focusedPlayerId.set(null);
        }

        // Same idea for selection - drop any selected id that no longer
        // exists (removed by this action or another) instead of carrying a
        // dangling reference forward.
        const liveIds = new Set(players.map((p) => p.id));
        const pruned = new Set([...this.selectedIds()].filter((id) => liveIds.has(id)));
        if (pruned.size !== this.selectedIds().size) {
            this.selectedIds.set(pruned);
        }

        // Removing players can shrink the page count out from under the
        // current page (e.g. bulk-removing near the end of the list) -
        // clamp back to the last valid page instead of showing a blank grid.
        const size = this.pageSize();
        if (size) {
            const lastPage = Math.max(0, Math.ceil(players.length / size) - 1);
            if (this.currentPage() > lastPage) this.currentPage.set(lastPage);
        }
    }

    public onToggleSelect(id: string): void {
        const next = new Set(this.selectedIds());
        if (next.has(id)) next.delete(id);
        else next.add(id);
        this.selectedIds.set(next);
    }

    public prevPage(): void {
        this.currentPage.update((p) => Math.max(0, p - 1));
    }

    public nextPage(): void {
        this.currentPage.update((p) => Math.min(this.totalPages() - 1, p + 1));
    }

    public async removeSelected(): Promise<void> {
        const ids = [...this.selectedIds()];
        if (ids.length === 0) return;
        await window.playerSwarm.removePlayers(ids);
        this.selectedIds.set(new Set());
    }

    public async removeAll(): Promise<void> {
        const ids = this.players().map((p) => p.id);
        if (ids.length === 0) return;
        await window.playerSwarm.removePlayers(ids);
        this.selectedIds.set(new Set());
    }

    public toggleGpu(): void {
        window.playerSwarm.setGpuDisabled(!this.gpuDisabled());
    }

    public onNavigate(event: { id: string; url: string }): void {
        window.playerSwarm.navigatePlayer(event.id, event.url);
    }

    public onGoBack(id: string): void {
        window.playerSwarm.goBackPlayer(id);
    }

    public onGoForward(id: string): void {
        window.playerSwarm.goForwardPlayer(id);
    }

    public onReloadPlayer(id: string): void {
        window.playerSwarm.reloadPlayer(id);
    }

    public onStopPlayer(id: string): void {
        window.playerSwarm.stopPlayer(id);
    }

    public onToggleMute(id: string): void {
        const player = this.players().find((p) => p.id === id);
        if (player) window.playerSwarm.setPlayerMuted(id, !player.muted);
    }

    public onOpenDevTools(id: string): void {
        window.playerSwarm.openPlayerDevTools(id);
    }

    public onRename(event: { id: string; label: string }): void {
        window.playerSwarm.renamePlayer(event.id, event.label);
    }

    public async chooseDockerRepoPath(): Promise<void> {
        const path = await window.playerSwarm.setDockerRepoPath();
        this.dockerRepoPath.set(path);
    }

    public setMode(next: ModalMode): void {
        this.mode.set(next);
        if (next === 'quick') {
            // Quick Instance never picks files - clear anything left over
            // from switching here after using New Instance, so a stale
            // selection can't silently trigger a rebuild instead.
            this.serverZipPath.set(null);
            this.uiZipPath.set(null);
            this.imagePath.set(null);
        }
    }

    public onRemovePlayer(id: string): void {
        void window.playerSwarm.removePlayer(id);
    }

    public openModal(): void {
        this.modalOpen.set(true);
        setTimeout(() => this.urlInput()?.inputElement().nativeElement.focus());
    }

    public closeModal(): void {
        if (this.building() && !this.buildError()) {
            // Minimize rather than cancel - the build itself runs entirely in
            // the main process via swarm-build.js, so it keeps going
            // regardless of modal visibility. Leave buildLog/buildError/
            // stopBuildProgress untouched so reopenBuildProgress() picks up
            // the same in-progress log exactly where it left off.
            this.modalOpen.set(false);
            return;
        }

        this.stopBuildProgress?.();
        this.stopBuildProgress = null;
        this.modalOpen.set(false);
        this.urlModel = '';
        this.envText = '';
        this.licenseText = '';
        this.quickLicensesText = '';
        this.quickCountText = '1';
        this.addCountText = '1';
        this.userAgentModel = '';
        this.mode.set('url');
        this.serverZipPath.set(null);
        this.uiZipPath.set(null);
        this.imagePath.set(null);
        this.building.set(false);
        this.buildLog.set([]);
        this.buildError.set(null);
        this.buildBatch.set(null);
    }

    /** Reopens the modal on top of a build that's still running in the background (see closeModal()). */
    public reopenBuildProgress(): void {
        this.modalOpen.set(true);
    }

    public submitModal(): void {
        const count = this.parseAddCount();
        if (count > 1) {
            void window.playerSwarm.addPlayers(count, this.urlModel);
        } else {
            void window.playerSwarm.addPlayer(this.urlModel, this.userAgentModel.trim() || undefined);
        }
        this.closeModal();
    }

    /** Clamped to [1, 20] - same light safety net as the Quick Instance count. */
    private parseAddCount(): number {
        const parsed = Number.parseInt(this.addCountText, 10);
        if (!Number.isFinite(parsed)) return 1;
        return Math.min(Math.max(parsed, 1), 20);
    }

    public canBuildInstance(): boolean {
        if (this.imagePath()) return true;
        const hasServer = Boolean(this.serverZipPath());
        const hasUi = Boolean(this.uiZipPath());
        if (hasServer && hasUi) return true;
        // Neither picked - reuse whatever's already built in extracted/
        // instead of forcing a fresh zip selection every time. swarm-build.js
        // fails fast with a clear message if there's genuinely no build yet.
        if (!hasServer && !hasUi) return true;
        return false; // only one of the two picked - ambiguous, don't submit yet
    }

    public async pickServerZip(): Promise<void> {
        const path = await window.playerSwarm.pickZipFile();
        if (path) this.serverZipPath.set(path);
    }

    public async pickUiZip(): Promise<void> {
        const path = await window.playerSwarm.pickZipFile();
        if (path) this.uiZipPath.set(path);
    }

    public fileName(fullPath: string): string {
        return fullPath.split(/[\\/]/).pop() ?? fullPath;
    }

    public onDragOver(event: DragEvent): void {
        event.preventDefault();
        this.dragActive.set(true);
    }

    public onDragLeave(event: DragEvent): void {
        event.preventDefault();
        this.dragActive.set(false);
    }

    public onDrop(event: DragEvent): void {
        event.preventDefault();
        this.dragActive.set(false);

        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length === 0) return;

        for (const file of files) {
            const path = window.playerSwarm.getPathForFile(file);
            this.classifyDroppedFile(path);
        }

        this.mode.set('instance');
        if (!this.modalOpen()) this.openModal();
    }

    public onInstanceDragOver(event: DragEvent): void {
        event.preventDefault();
        this.instanceDragActive.set(true);
    }

    public onInstanceDragLeave(event: DragEvent): void {
        event.preventDefault();
        this.instanceDragActive.set(false);
    }

    /** Drop target inside the New Instance form itself - same classify logic as the grid-level drop, so both the .zip files can be dragged in together (or a .img) without leaving the modal. */
    public onInstanceDrop(event: DragEvent): void {
        event.preventDefault();
        this.instanceDragActive.set(false);

        const files = Array.from(event.dataTransfer?.files ?? []);
        for (const file of files) {
            const path = window.playerSwarm.getPathForFile(file);
            this.classifyDroppedFile(path);
        }
    }

    private classifyDroppedFile(path: string): void {
        const lower = path.toLowerCase();
        if (lower.endsWith('.img')) {
            this.imagePath.set(path);
            return;
        }
        if (lower.includes('ui') && !lower.includes('server')) {
            this.uiZipPath.set(path);
        } else if (lower.includes('server')) {
            this.serverZipPath.set(path);
        } else if (!this.serverZipPath()) {
            this.serverZipPath.set(path);
        } else {
            this.uiZipPath.set(path);
        }
    }

    public async submitInstanceBuild(): Promise<void> {
        // First time through (or if it was never set), prompt for the
        // player-swarm-docker folder right here instead of letting the
        // build fail with a raw IPC error - same picker as the toolbar
        // button, just triggered lazily on first actual need.
        if (!this.dockerRepoPath()) {
            const path = await this.chooseDockerRepoPath().then(() => this.dockerRepoPath());
            if (!path) return; // cancelled the picker - stay on the form, nothing started yet
        }

        // Only Quick Instance (reusing what's already in ./extracted/, no
        // rebuild) supports a batch count - New Instance always builds from
        // a specific zip/image pair, so it wouldn't make sense to repeat.
        const count = this.mode() === 'quick' ? this.parseQuickCount() : 1;
        const quickLicenses = this.mode() === 'quick' ? this.parseQuickLicenses() : [];

        this.building.set(true);
        this.buildLog.set([]);
        this.buildError.set(null);
        this.buildBatch.set(count > 1 ? { current: 1, total: count } : null);

        this.stopBuildProgress = window.playerSwarm.onBuildProgress((event) => this.onBuildProgress(event));

        try {
            // Sequential, not parallel - swarm-build.js takes an exclusive
            // lock on ./extracted/ per run (only one build at a time), so
            // concurrent calls would just queue up behind each other anyway;
            // awaiting one at a time also keeps the log/progress readable.
            for (let i = 1; i <= count; i++) {
                if (count > 1) {
                    this.buildBatch.set({ current: i, total: count });
                    this.buildLog.update((lines) => [...lines, `— Instance ${i} of ${count} —`]);
                }

                // Quick Instance batches pull one license per instance, positionally,
                // from the pasted list - a key is single-use/unclaimed (see
                // create-instance.sh), so reusing the same one across a batch would
                // only ever activate the first. A batch with fewer keys than
                // instances just creates the rest without one instead of failing.
                const license = this.mode() === 'quick' ? quickLicenses[i - 1] : this.licenseText.trim() || undefined;

                const result = await window.playerSwarm.buildInstance({
                    serverZipPath: this.serverZipPath() ?? undefined,
                    uiZipPath: this.uiZipPath() ?? undefined,
                    imagePath: this.imagePath() ?? undefined,
                    env: this.envText.trim() || undefined,
                    license,
                });
                void window.playerSwarm.addPlayer(
                    result.url,
                    undefined,
                    this.envText.trim() || undefined,
                    license,
                    result.name,
                );
            }

            this.building.set(false); // clear this before closeModal() - it guards against a MID-build dismissal, which would otherwise also block this success-path close
            this.closeModal();
        } catch (err) {
            this.buildError.set(err instanceof Error ? err.message : String(err));
        }
    }

    /** One license key per line - lines are matched positionally to instances 1..count; a batch with fewer keys than instances just creates the rest without one. */
    public quickLicenseCount(): number {
        return this.parseQuickLicenses().length;
    }

    /** True whenever the license count and instance count don't line up, either direction - drives the hint's warning styling. */
    public quickLicenseMismatch(): boolean {
        return this.quickLicenseCount() !== this.parseQuickCount();
    }

    /** More licenses pasted than instances being created - those extra ones can never be used, so this blocks submit rather than just warning (unlike the "fewer licenses than instances" case, which is a legitimate partial-licensing workflow). */
    public quickTooManyLicenses(): boolean {
        return this.quickLicenseCount() > this.parseQuickCount();
    }

    private parseQuickLicenses(): string[] {
        return this.quickLicensesText
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    }

    /** Parses quickCountText, clamped to [1, 20] - a light safety net against fat-fingering a huge batch (see this repo's own Docker network-pool exhaustion incident). */
    public parseQuickCount(): number {
        const parsed = Number.parseInt(this.quickCountText, 10);
        if (!Number.isFinite(parsed)) return 1;
        return Math.min(Math.max(parsed, 1), 20);
    }

    private onBuildProgress(event: BuildProgressEvent): void {
        const line =
            event.phase === 'log'
                ? (event.message ?? '')
                : `— ${event.phase}${event.message ? `: ${event.message}` : ''}`;
        if (line.trim().length === 0) return;
        this.buildLog.update((lines) => [...lines, line]);
    }
}
