import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC, type AddPlayerRequest, type CellBounds, type RemovePlayerResult } from '@shared/types';
import { PlayerManager } from './playerManager';

function createShellWindow(): BrowserWindow {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
    if (rendererUrl) {
        void win.loadURL(rendererUrl);
    } else {
        void win.loadFile(join(__dirname, '../renderer/index.html'));
    }

    return win;
}

function registerIpcHandlers(win: BrowserWindow, players: PlayerManager): void {
    ipcMain.handle(IPC.addPlayer, (_event, request?: AddPlayerRequest) => players.create(request?.url));

    ipcMain.handle(IPC.removePlayer, async (_event, id: string): Promise<RemovePlayerResult> => {
        const { response } = await dialog.showMessageBox(win, {
            type: 'question',
            buttons: ['Cancel', 'Keep Session Data', 'Purge Session Data'],
            defaultId: 1,
            cancelId: 0,
            message: 'Remove this player?',
            detail: 'Purging also deletes its cookies, local storage, and cache.',
        });

        if (response === 0) return { removed: false, purged: false };

        const purge = response === 2;
        const removed = await players.remove(id, purge);
        return { removed, purged: removed && purge };
    });

    ipcMain.handle(IPC.listPlayers, () => players.list());

    ipcMain.on(IPC.reportGridBounds, (_event, cells: CellBounds[]) => {
        players.applyBounds(cells);
    });

    ipcMain.on(IPC.setOverlayVisible, (_event, visible: boolean) => {
        players.setOverlayVisible(visible);
    });

    players.on('changed', (list) => {
        win.webContents.send(IPC.playersChanged, list);
    });
}

app.whenReady().then(() => {
    const win = createShellWindow();
    const players = new PlayerManager(win);
    registerIpcHandlers(win, players);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createShellWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
