import { EventEmitter } from 'node:events';
import { session, WebContentsView, type BaseWindow, type Rectangle } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { CellBounds, Player } from '@shared/types';
import { Store } from './store';

const DEFAULT_URL = 'about:blank';
const HIDDEN_BOUNDS: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

/**
 * Single source of truth for player state. Owns every guest WebContentsView's
 * lifecycle (create/attach/reposition/destroy) and its session partition.
 * The renderer never mutates this state directly — it reflects it via IPC.
 *
 * Guest views are attached via contentView.addChildView(), which always stacks
 * them above the shell renderer's own DOM layer — there is no z-index to sort
 * against. Renderer-drawn overlays (dialogs, modals) must ask via
 * setOverlayVisible() to have every guest view hidden while they're open.
 */
export class PlayerManager extends EventEmitter {
    private readonly store = new Store();
    private readonly views = new Map<string, WebContentsView>();
    private readonly lastBounds = new Map<string, Rectangle>();
    private overlayVisible = false;

    public constructor(private readonly shell: BaseWindow) {
        super();
    }

    public create(url?: string): Player {
        const id = uuidv4();
        const partition = `persist:player-${id}`;
        const targetUrl = url && url.trim().length > 0 ? url.trim() : DEFAULT_URL;

        const view = new WebContentsView({
            webPreferences: {
                partition,
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
            },
        });

        // Hidden until the renderer reports this player's grid-cell bounds.
        view.setBounds(HIDDEN_BOUNDS);
        this.shell.contentView.addChildView(view);
        void view.webContents.loadURL(targetUrl);

        const player: Player = { id, url: targetUrl, partition };
        this.store.add(player);
        this.views.set(id, view);
        this.emitChanged();

        return player;
    }

    public async remove(id: string, purge: boolean): Promise<boolean> {
        const view = this.views.get(id);
        const player = this.store.get(id);
        if (!view || !player) return false;

        this.shell.contentView.removeChildView(view);
        view.webContents.close();
        this.views.delete(id);
        this.lastBounds.delete(id);
        this.store.remove(id);

        if (purge) {
            await session.fromPartition(player.partition).clearStorageData();
        }

        this.emitChanged();
        return true;
    }

    public list(): Player[] {
        return this.store.list();
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
            if (view && !this.overlayVisible) view.setBounds(bounds);
        }
    }

    /** Hides (or restores) every guest view so a renderer-drawn overlay can be seen above them. */
    public setOverlayVisible(visible: boolean): void {
        this.overlayVisible = visible;

        for (const [id, view] of this.views) {
            if (visible) {
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
}
