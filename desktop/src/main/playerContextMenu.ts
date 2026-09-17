import { BrowserWindow, clipboard, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { IPC, type ShowToolbarMenuRequest, type ToolbarMenuActionEvent } from '../shared/types';
import { menuItemKey, type MenuRectangle, type PlayerMenuData } from '../shared/playerMenu';
import { LAYOUT_MENU_WIDTH, menuHeight, PLAYER_MENU_WIDTH, playerMenuBounds, playerMenuItems, screenAnchor, submenuBounds, TOOLBAR_MENU_WIDTH } from './playerMenuModel';
import { toolbarMenuItems } from './toolbarMenu';

const C = { initial: 'player-menu:initial', ready: 'player-menu:ready', choose: 'player-menu:choose',
    dismiss: 'player-menu:dismiss', update: 'player-menu:update', submenu: 'player-menu:submenu',
    enter: 'player-menu:enter', back: 'player-menu:back', branch: 'player-menu:branch', focus: 'player-menu:focus' };

interface Popup {
    window: BrowserWindow;
    data: PlayerMenuData;
    loaded: boolean;
    focusOnReady: boolean;
    ownerAction?: string;
}

/** Compact native windows, never DOM overlays on (or replacements for) player views. */
export class PlayerContextMenu {
    private root?: Popup;
    private chain: Popup[] = [];
    private active?: { kind: string; playerId?: string; trigger: string };
    private lastDismissed?: { trigger: string; at: number };
    private sequence = 0;
    private disposed = false;
    private focusTimer?: NodeJS.Timeout;
    private hoverTimer?: NodeJS.Timeout;
    private hoverDepth = -1;
    private readonly dismiss = () => this.hide();
    private readonly parentBlur = () => {
        clearTimeout(this.focusTimer);
        // Focus can transfer between any two windows in the submenu chain.
        this.focusTimer = setTimeout(() => {
            if (!this.chain.some((entry) => entry.window.isFocused())) this.hide();
        }, 50);
    };
    private readonly initial = (event: IpcMainInvokeEvent) => this.entry(event, undefined, true)?.data ?? null;
    private readonly ready = (event: IpcMainEvent, token: number) => {
        const entry = this.entry(event, token);
        if (!entry || !this.active || !this.stillValid(this.active)) return;
        if (!this.parent.isFocused() && !this.chain.some((item) => item.window.isFocused())) { this.hide(); return; }
        entry.loaded = true;
        if (entry.focusOnReady) {
            entry.window.show();
            entry.window.focus();
            if (entry.data.depth) entry.window.webContents.send(C.focus, null);
        } else entry.window.showInactive();
    };
    private readonly choose = (event: IpcMainEvent, token: number, action: string) => {
        const entry = this.entry(event, token);
        if (!entry?.window.isVisible() || !this.active) return;
        const data = this.active;
        if (!this.stillValid(data)) { this.hide(); return; }
        if (action === 'copy-url' && data.kind === 'player' && entry === this.root) {
            if (entry.data.url) clipboard.writeText(entry.data.url);
            this.hide(true);
            return;
        }
        const item = entry.data.items.find((candidate) => !candidate.heading && !candidate.submenu && candidate.enabled && menuItemKey(candidate) === action);
        if (!item) return;
        this.hide(true);
        this.parent.webContents.send(IPC.toolbarMenuAction, data.kind === 'player'
            ? { kind: 'player', action: item.action, playerId: data.playerId }
            : { kind: entry.data.kind, action: item.action, ...(item.value === undefined ? {} : { value: item.value }) } satisfies ToolbarMenuActionEvent);
    };
    private readonly closeRequest = (event: IpcMainEvent, token: number) => {
        if (this.entry(event, token)) this.hide(true);
    };
    private readonly enter = (event: IpcMainEvent, token: number) => {
        const entry = this.entry(event, token);
        // Entering the existing descendant cancels a sibling switch queued during diagonal travel.
        if (entry && this.chain.indexOf(entry) > this.hoverDepth) this.cancelHover();
    };
    private readonly back = (event: IpcMainEvent, token: number) => {
        const entry = this.entry(event, token);
        if (!entry) return;
        const depth = this.chain.indexOf(entry);
        if (depth < 1) return;
        this.cancelHover();
        const parent = this.chain[depth - 1];
        if (!parent) return;
        parent.window.focus();
        this.closeAfter(depth - 1);
        parent.window.webContents.send(C.focus, entry.ownerAction);
    };
    private readonly submenu = (event: IpcMainEvent, token: number, action: string, row: MenuRectangle, keyboard: boolean) => {
        const entry = this.entry(event, token);
        if (!entry?.window.isVisible() || !this.active || !this.stillValid(this.active)) return;
        const item = entry.data.items.find((candidate) => candidate.enabled && !candidate.heading && menuItemKey(candidate) === action);
        const bounds = entry.window.getContentBounds();
        if (!item || typeof keyboard !== 'boolean' || !row ||
            ![row.x, row.y, row.width, row.height].every(Number.isFinite) || row.x < 0 || row.y < 0 ||
            row.width <= 0 || row.height <= 0 || row.x + row.width > bounds.width + 1 || row.y + row.height > bounds.height + 1) return;
        this.cancelHover();
        const depth = this.chain.indexOf(entry);
        const open = () => {
            this.cancelHover();
            if (this.chain[depth] !== entry || !entry.window.isVisible()) return;
            const existing = this.chain[depth + 1];
            if (item.submenu && existing?.ownerAction === action) {
                if (keyboard) {
                    existing.focusOnReady = true;
                    if (existing.window.isVisible()) { existing.window.focus(); existing.window.webContents.send(C.focus, null); }
                }
                return;
            }
            if (this.chain.slice(depth + 1).some((child) => child.window.isFocused())) entry.window.focus();
            this.closeAfter(depth);
            if (!item.submenu?.length) return;
            const anchor = { x: bounds.x, y: bounds.y + row.y, width: bounds.width, height: row.height };
            const area = screen.getDisplayNearestPoint({ x: bounds.x + Math.round(bounds.width / 2), y: bounds.y }).workArea;
            const size = { width: LAYOUT_MENU_WIDTH, height: menuHeight(item.submenu, false) };
            const ancestor = this.chain[depth - 1];
            const preferLeft = !!ancestor && bounds.x < ancestor.window.getBounds().x;
            const childBounds = submenuBounds(anchor, area, size, preferLeft);
            const child = this.createPopup({ ...entry.data, ...size, token: ++this.sequence,
                items: item.submenu, depth: depth + 1, label: item.label }, childBounds, keyboard);
            child.ownerAction = action;
            this.chain.push(child);
            entry.window.webContents.send(C.branch, action);
        };
        if (keyboard) open();
        else { this.hoverDepth = depth; this.hoverTimer = setTimeout(open, 220); }
    };

    constructor(private readonly parent: BrowserWindow, private readonly exists: (id: string) => boolean) {
        ipcMain.handle(C.initial, this.initial);
        ipcMain.on(C.ready, this.ready);
        ipcMain.on(C.choose, this.choose);
        ipcMain.on(C.dismiss, this.closeRequest);
        ipcMain.on(C.submenu, this.submenu);
        ipcMain.on(C.enter, this.enter);
        ipcMain.on(C.back, this.back);
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

    private entry(event: IpcMainEvent | IpcMainInvokeEvent, token: number | undefined, initial = false): Popup | undefined {
        if (this.disposed || (!initial && !Number.isSafeInteger(token))) return;
        return this.chain.find((entry) => !entry.window.isDestroyed() && event.sender === entry.window.webContents &&
            event.senderFrame === entry.window.webContents.mainFrame && (token === undefined || entry.data.token === token));
    }

    private stillValid(data: { kind: string; playerId?: string }) {
        return data.kind !== 'player' || (!!data.playerId && this.exists(data.playerId));
    }

    private createPopup(data: PlayerMenuData, bounds: MenuRectangle, focusOnReady: boolean): Popup {
        const window = new BrowserWindow({
            ...bounds, parent: this.parent, show: false, frame: false, thickFrame: false,
            resizable: false, movable: false, minimizable: false, maximizable: false,
            fullscreenable: false, skipTaskbar: true, roundedCorners: false, hasShadow: false, transparent: true,
            backgroundColor: '#00000000', title: 'Menu',
            webPreferences: { preload: join(__dirname, '../preload/player-menu.js'),
                sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
        });
        const entry: Popup = { window, data, loaded: false, focusOnReady };
        window.setMenu(null);
        window.webContents.setZoomFactor(1);
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        window.webContents.on('will-navigate', (event) => event.preventDefault());
        window.webContents.on('render-process-gone', () => { this.hide(); if (!window.isDestroyed()) window.destroy(); });
        window.on('blur', this.parentBlur);
        window.webContents.on('did-finish-load', () => {
            entry.loaded = true;
            if (this.chain.includes(entry)) window.webContents.send(C.update, entry.data);
        });
        window.on('closed', () => {
            if (this.chain.includes(entry)) this.hide();
            if (this.root === entry) this.root = undefined;
        });
        const url = process.env.ELECTRON_RENDERER_URL;
        const loading = url ? window.loadURL(`${url.replace(/\/$/, '')}/player-menu.html`)
            : window.loadFile(join(__dirname, '../renderer/player-menu.html'));
        void loading.catch(() => {
            if (this.chain.includes(entry)) this.hide();
            if (!window.isDestroyed()) window.destroy();
        });
        return entry;
    }

    show(request: ShowToolbarMenuRequest) {
        const player = request.context.player;
        if (this.disposed || !this.parent.isVisible()) return;
        if (request.kind === 'player' ? !player || !this.exists(player.id) : !['actions', 'remove', 'layout', 'settings'].includes(request.kind)) return;
        const trigger = request.anchor ? `${request.kind}:${player?.id ?? ''}` : '';
        if (trigger && this.active?.trigger === trigger && this.root?.window.isVisible()) { this.hide(true); return; }
        if (trigger && this.lastDismissed?.trigger === trigger && Date.now() - this.lastDismissed.at < 300) { this.lastDismissed = undefined; return; }
        let anchor;
        try { anchor = screenAnchor(request, this.parent.getContentBounds(), this.parent.webContents.getZoomFactor()); }
        catch { return; }
        const display = screen.getDisplayNearestPoint({ x: anchor.x + Math.round(anchor.width / 2), y: anchor.y + Math.round(anchor.height / 2) });
        const items = request.kind === 'player' ? playerMenuItems(player!) : toolbarMenuItems(request.kind, request.context);
        const width = request.kind === 'player' ? PLAYER_MENU_WIDTH : request.kind === 'layout' ? LAYOUT_MENU_WIDTH : TOOLBAR_MENU_WIDTH;
        const height = menuHeight(items, request.kind === 'player');
        const bounds = playerMenuBounds(anchor, display.workArea, { width, height });
        this.hide();
        this.active = { kind: request.kind, playerId: player?.id, trigger };
        const data: PlayerMenuData = { token: ++this.sequence, kind: request.kind, name: player?.name ?? '',
            url: player?.url || '', width, height, items, depth: 0 };
        if (!this.root || this.root.window.isDestroyed()) this.root = this.createPopup(data, bounds, true);
        else { this.root.data = data; this.root.focusOnReady = true; this.root.window.setBounds(bounds); }
        this.chain = [this.root];
        if (this.root.loaded) this.root.window.webContents.send(C.update, data);
    }

    private cancelHover() {
        clearTimeout(this.hoverTimer);
        this.hoverDepth = -1;
    }

    private closeAfter(depth: number) {
        const removed = this.chain.splice(depth + 1);
        for (const entry of removed.reverse()) if (!entry.window.isDestroyed()) entry.window.destroy();
        const parent = this.chain[depth];
        if (parent && !parent.window.isDestroyed()) parent.window.webContents.send(C.branch, null);
    }

    hide(restoreFocus = false) {
        if (!restoreFocus && this.active?.trigger && this.root?.window.isVisible()) this.lastDismissed = { trigger: this.active.trigger, at: Date.now() };
        this.active = undefined;
        this.cancelHover();
        this.closeAfter(0);
        this.chain = [];
        if (this.root && !this.root.window.isDestroyed()) this.root.window.hide();
        clearTimeout(this.focusTimer);
        if (restoreFocus && !this.parent.isDestroyed()) this.parent.focus();
    }

    validatePlayer() {
        if (this.active && !this.stillValid(this.active)) this.hide();
    }

    private dispose() {
        this.disposed = true;
        this.hide();
        if (this.root && !this.root.window.isDestroyed()) this.root.window.destroy();
        ipcMain.removeHandler(C.initial);
        ipcMain.removeListener(C.ready, this.ready);
        ipcMain.removeListener(C.choose, this.choose);
        ipcMain.removeListener(C.dismiss, this.closeRequest);
        ipcMain.removeListener(C.submenu, this.submenu);
        ipcMain.removeListener(C.enter, this.enter);
        ipcMain.removeListener(C.back, this.back);
        screen.removeListener('display-added', this.dismiss);
        screen.removeListener('display-removed', this.dismiss);
        screen.removeListener('display-metrics-changed', this.dismiss);
    }
}
