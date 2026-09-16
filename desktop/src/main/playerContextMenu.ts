import { BrowserWindow, clipboard, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { IPC, type ShowToolbarMenuRequest, type ToolbarMenuActionEvent } from '../shared/types';
import { menuItemKey, type PlayerMenuData } from '../shared/playerMenu';
import { menuHeight, PLAYER_MENU_WIDTH, playerMenuBounds, playerMenuItems, screenAnchor, TOOLBAR_MENU_WIDTH } from './playerMenuModel';
import { toolbarMenuItems } from './toolbarMenu';

const C = { initial: 'player-menu:initial', ready: 'player-menu:ready', choose: 'player-menu:choose',
    dismiss: 'player-menu:dismiss', update: 'player-menu:update' };

/**
 * A single reusable child window for the player menu and the toolbar's
 * Actions/Remove/Layout/Settings menus. It never attaches to or hides player views.
 */
export class PlayerContextMenu {
    private popup?: BrowserWindow;
    private active?: PlayerMenuData & { playerId?: string; trigger: string };
    /** Which button's menu was just dismissed, so clicking that button again closes the menu instead of reopening it. */
    private lastDismissed?: { trigger: string; at: number };
    private loaded = false;
    private sequence = 0;
    private disposed = false;
    private focusTimer?: NodeJS.Timeout;
    private readonly dismiss = () => this.hide();
    private readonly parentBlur = () => {
        clearTimeout(this.focusTimer);
        // Opening the popup transfers focus from the parent. Only outside focus dismisses it.
        this.focusTimer = setTimeout(() => {
            if (!this.popup?.isFocused()) this.hide();
        }, 50);
    };
    private readonly initial = (event: IpcMainInvokeEvent) => this.allowed(event) ? this.active || null : null;
    private readonly ready = (event: IpcMainEvent, token: number) => {
        if (!Number.isSafeInteger(token) || !this.allowed(event, token) || !this.active || !this.stillValid(this.active)) return;
        if (!this.parent.isFocused() && !this.popup?.isFocused()) { this.hide(); return; }
        this.loaded = true;
        this.popup!.show();
        this.popup!.focus();
    };
    private readonly choose = (event: IpcMainEvent, token: number, action: string) => {
        if (!Number.isSafeInteger(token) || !this.allowed(event, token) || !this.popup?.isVisible() || !this.active) return;
        const data = this.active;
        if (!this.stillValid(data)) { this.hide(); return; }
        if (action === 'copy-url' && data.kind === 'player') {
            if (data.url) clipboard.writeText(data.url);
            this.hide(true);
            return;
        }
        const item = data.items.find((candidate) => !candidate.heading && candidate.enabled && menuItemKey(candidate) === action);
        if (!item) return;
        this.hide(true);
        this.parent.webContents.send(IPC.toolbarMenuAction, data.kind === 'player'
            ? { kind: 'player', action: item.action, playerId: data.playerId }
            : { kind: data.kind, action: item.action, ...(item.value === undefined ? {} : { value: item.value }) } satisfies ToolbarMenuActionEvent);
    };
    private readonly closeRequest = (event: IpcMainEvent, token: number) => {
        if (Number.isSafeInteger(token) && this.allowed(event, token)) this.hide(true);
    };

    constructor(private readonly parent: BrowserWindow, private readonly exists: (id: string) => boolean) {
        ipcMain.handle(C.initial, this.initial);
        ipcMain.on(C.ready, this.ready);
        ipcMain.on(C.choose, this.choose);
        ipcMain.on(C.dismiss, this.closeRequest);
        parent.on('move', this.dismiss);
        parent.on('resize', this.dismiss);
        parent.on('hide', this.dismiss);
        parent.on('minimize', this.dismiss);
        parent.on('blur', this.parentBlur);
        parent.once('closed', () => this.dispose());
        parent.webContents.on('did-start-loading', this.dismiss);
        screen.on('display-added', this.dismiss);
        screen.on('display-removed', this.dismiss);
        screen.on('display-metrics-changed', this.dismiss);
    }

    private allowed(event: IpcMainEvent | IpcMainInvokeEvent, token?: number) {
        return !this.disposed && !!this.popup && !this.popup.isDestroyed() &&
            event.sender === this.popup.webContents && event.senderFrame === this.popup.webContents.mainFrame &&
            (token === undefined || this.active?.token === token);
    }

    private stillValid(data: { kind: string; playerId?: string }) {
        return data.kind !== 'player' || (!!data.playerId && this.exists(data.playerId));
    }

    show(request: ShowToolbarMenuRequest) {
        const player = request.context.player;
        if (this.disposed || !this.parent.isVisible()) return;
        if (request.kind === 'player' ? !player || !this.exists(player.id) : !['actions', 'remove', 'layout', 'settings'].includes(request.kind)) return;
        const trigger = request.anchor ? `${request.kind}:${player?.id ?? ''}` : '';
        // A click on the button whose menu is open first blurs the popup (closing it), then arrives here.
        if (trigger && this.active?.trigger === trigger && this.popup?.isVisible()) { this.hide(true); return; }
        if (trigger && this.lastDismissed?.trigger === trigger && Date.now() - this.lastDismissed.at < 300) { this.lastDismissed = undefined; return; }
        let anchor;
        try { anchor = screenAnchor(request, this.parent.getContentBounds(), this.parent.webContents.getZoomFactor()); }
        catch { return; }
        const display = screen.getDisplayNearestPoint({ x: anchor.x + Math.round(anchor.width / 2), y: anchor.y + Math.round(anchor.height / 2) });
        const items = request.kind === 'player' ? playerMenuItems(player!) : toolbarMenuItems(request.kind, request.context);
        const width = request.kind === 'player' ? PLAYER_MENU_WIDTH : TOOLBAR_MENU_WIDTH;
        const height = menuHeight(items, request.kind === 'player');
        const bounds = playerMenuBounds(anchor, display.workArea, { width, height });
        this.hide();
        this.active = { token: ++this.sequence, kind: request.kind, playerId: player?.id, trigger, name: player?.name ?? '',
            url: player?.url || '', width, height, items };
        if (!this.popup || this.popup.isDestroyed()) {
            this.loaded = false;
            const popup = new BrowserWindow({
                ...bounds, parent: this.parent, show: false, frame: false, thickFrame: false,
                resizable: false, movable: false, minimizable: false, maximizable: false,
                fullscreenable: false, skipTaskbar: true, roundedCorners: false, hasShadow: false, transparent: true,
                backgroundColor: '#00000000', title: 'Menu',
                webPreferences: { preload: join(__dirname, '../preload/player-menu.js'),
                    sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
            });
            this.popup = popup;
            popup.setMenu(null);
            popup.webContents.setZoomFactor(1);
            popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
            popup.webContents.on('will-navigate', (event) => event.preventDefault());
            popup.webContents.on('render-process-gone', () => { this.hide(); popup.destroy(); });
            popup.on('blur', () => { if (popup.isVisible()) this.hide(); });
            popup.webContents.on('did-finish-load', () => {
                this.loaded = true;
                if (this.active) popup.webContents.send(C.update, this.active);
            });
            popup.on('closed', () => { this.popup = undefined; this.loaded = false; this.active = undefined; });
            const url = process.env.ELECTRON_RENDERER_URL;
            const loading = url ? popup.loadURL(`${url.replace(/\/$/, '')}/player-menu.html`)
                : popup.loadFile(join(__dirname, '../renderer/player-menu.html'));
            void loading.catch(() => { this.hide(); if (!popup.isDestroyed()) popup.destroy(); });
        } else {
            this.popup.setBounds(bounds);
            if (this.loaded) this.popup.webContents.send(C.update, this.active);
        }
    }

    hide(restoreFocus = false) {
        // Only an outside click (focus loss) can be that same button being clicked again; choosing or Escape cannot.
        if (!restoreFocus && this.active?.trigger && this.popup?.isVisible()) this.lastDismissed = { trigger: this.active.trigger, at: Date.now() };
        this.active = undefined;
        clearTimeout(this.focusTimer);
        if (this.popup && !this.popup.isDestroyed()) this.popup.hide();
        if (restoreFocus && !this.parent.isDestroyed()) this.parent.focus();
    }

    validatePlayer() {
        if (this.active && !this.stillValid(this.active)) this.hide();
    }

    private dispose() {
        this.disposed = true;
        this.hide();
        this.popup?.destroy();
        ipcMain.removeHandler(C.initial);
        ipcMain.removeListener(C.ready, this.ready);
        ipcMain.removeListener(C.choose, this.choose);
        ipcMain.removeListener(C.dismiss, this.closeRequest);
        screen.removeListener('display-added', this.dismiss);
        screen.removeListener('display-removed', this.dismiss);
        screen.removeListener('display-metrics-changed', this.dismiss);
    }
}
