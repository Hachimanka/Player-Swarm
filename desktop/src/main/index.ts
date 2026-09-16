import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain as electronIpc, Menu } from 'electron';
import {
    IPC,
    type AddPlayerRequest,
    type BuildInstanceRequest,
    type CellBounds,
    type RemovePlayerResult,
    type RemovePlayersResult,
    type ShowToolbarMenuRequest,
} from '@shared/types';
import { buildInstance, deleteInstance } from './instanceBuilder';
import { PlayerManager } from './playerManager';
import * as settings from './settings';
import { showToolbarMenu } from './toolbarMenu';
import { registerInstanceConsole } from './instanceConsole';
import { PlayerContextMenu } from './playerContextMenu';

// Must run before app.whenReady() - disableHardwareAcceleration() has no
// effect once Chromium has already finished GPU init (INITPROJECT.md §6:
// "Provide a settings toggle for --disable-gpu / hardware acceleration").
if (settings.getGpuDisabled()) {
    app.disableHardwareAcceleration();
}

// This is a kiosk-style player-content app, not a document editor - the
// default File/Edit/View/Window menu bar (with its own Reload/DevTools/Zoom
// items etc.) is Electron chrome nobody here asked for, and it eats vertical
// space above the toolbar this app already provides its own set of controls
// through (Actions/Remove/Settings, all native menus already - see
// toolbarMenu.ts). null removes it outright, not just auto-hidden-until-Alt.
Menu.setApplicationMenu(null);

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

/**
 * Tears down a player-swarm-docker instance (Docker containers + its
 * instances/<name>/ folder) as a side effect of Purge Session Data, rather
 * than through its own separate confirm dialog - Purge already asked "are
 * you sure, this deletes real data" once, a second confirm just for the
 * instance would be redundant. Failures are shown natively here (same
 * reasoning as the standalone flow this replaced) rather than left silent,
 * since a failed removal otherwise just looks like nothing happened.
 */
async function purgeInstance(win: BrowserWindow, instanceName: string): Promise<void> {
    const dockerRepoPath = settings.getDockerRepoPath();
    if (!dockerRepoPath) {
        await dialog.showMessageBox(win, {
            type: 'error',
            message: `Could not delete Docker instance ${instanceName}`,
            detail: 'The player-swarm-docker folder location is not set (Settings) - its containers/data were left in place.',
        });
        return;
    }

    try {
        await deleteInstance(win, dockerRepoPath, instanceName);
    } catch (err) {
        await dialog.showMessageBox(win, {
            type: 'error',
            message: `Failed to delete Docker instance ${instanceName}`,
            detail: err instanceof Error ? err.message : String(err),
        });
    }
}

function registerIpcHandlers(win: BrowserWindow, players: PlayerManager): void {
    // The console has its own restricted bridge. Reject shell IPC from console
    // windows, guest players and subframes even if they know a channel name.
    const ipcMain = {
        handle: (channel: string, listener: Parameters<typeof electronIpc.handle>[1]) => electronIpc.handle(channel, (event, ...args) => {
            if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Unauthorized shell sender.');
            return listener(event, ...args);
        }),
        on: (channel: string, listener: Parameters<typeof electronIpc.on>[1]) => electronIpc.on(channel, (event, ...args) => {
            if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return;
            listener(event, ...args);
        }),
    };
    ipcMain.handle(IPC.addPlayer, (_event, request?: AddPlayerRequest) =>
        players.create(request?.url, request?.userAgent, request?.env, request?.license, request?.instanceName),
    );

    ipcMain.handle(IPC.addPlayers, (_event, count: number, url?: string) => players.createMany(count, url));

    ipcMain.handle(IPC.removePlayer, async (_event, id: string): Promise<RemovePlayerResult> => {
        const instanceName = players.list().find((p) => p.id === id)?.instanceName;

        const { response } = await dialog.showMessageBox(win, {
            type: 'question',
            buttons: ['Cancel', 'Keep Session Data', 'Purge Session Data'],
            defaultId: 1,
            cancelId: 0,
            message: 'Remove this player?',
            detail: instanceName
                ? 'Purging also deletes its cookies, local storage, and cache - and stops its Docker containers and deletes its instance data. This cannot be undone.'
                : 'Purging also deletes its cookies, local storage, and cache.',
        });

        if (response === 0) return { removed: false, purged: false };

        const purge = response === 2;
        const removed = await players.remove(id, purge);
        if (removed && purge && instanceName) await purgeInstance(win, instanceName);
        return { removed, purged: removed && purge };
    });

    ipcMain.handle(IPC.removePlayers, async (_event, ids: string[]): Promise<RemovePlayersResult> => {
        if (ids.length === 0) return { removed: 0, purged: false };

        const idSet = new Set(ids);
        const instanceNames = [
            ...new Set(
                players
                    .list()
                    .filter((p) => idSet.has(p.id) && p.instanceName)
                    .map((p) => p.instanceName as string),
            ),
        ];

        // One dialog for the whole batch, not one per player - N native
        // confirmation prompts in a row for a bulk action would be unusable.
        const { response } = await dialog.showMessageBox(win, {
            type: 'question',
            buttons: ['Cancel', 'Keep Session Data', 'Purge Session Data'],
            defaultId: 1,
            cancelId: 0,
            message: `Remove ${ids.length} player${ids.length === 1 ? '' : 's'}?`,
            detail: instanceNames.length
                ? 'Purging also deletes their cookies, local storage, and cache - and stops/deletes any Docker instances among them. This cannot be undone.'
                : 'Purging also deletes their cookies, local storage, and cache.',
        });

        if (response === 0) return { removed: 0, purged: false };

        const purge = response === 2;
        let removed = 0;
        for (const id of ids) {
            if (await players.remove(id, purge)) removed++;
        }

        if (purge) {
            for (const instanceName of instanceNames) await purgeInstance(win, instanceName);
        }

        return { removed, purged: removed > 0 && purge };
    });

    ipcMain.handle(IPC.listPlayers, () => players.list());

    ipcMain.on(IPC.reportGridBounds, (_event, cells: CellBounds[]) => {
        players.applyBounds(cells);
    });

    ipcMain.on(IPC.setOverlayVisible, (_event, visible: boolean) => {
        players.setOverlayVisible(visible);
    });

    ipcMain.on(IPC.navigatePlayer, (_event, id: string, url: string) => players.navigate(id, url));
    ipcMain.on(IPC.goBackPlayer, (_event, id: string) => players.goBack(id));
    ipcMain.on(IPC.goForwardPlayer, (_event, id: string) => players.goForward(id));
    ipcMain.on(IPC.reloadPlayer, (_event, id: string) => players.reload(id));
    ipcMain.on(IPC.stopPlayer, (_event, id: string) => players.stopLoading(id));
    ipcMain.on(IPC.setPlayerMuted, (_event, id: string, muted: boolean) => players.setMuted(id, muted));
    ipcMain.on(IPC.openPlayerDevTools, (_event, id: string) => players.openDevTools(id));
    ipcMain.on(IPC.renamePlayer, (_event, id: string, label: string) => players.rename(id, label));
    ipcMain.on(IPC.reloadAllPlayers, () => players.reloadAll());
    ipcMain.on(IPC.setAllPlayersMuted, (_event, muted: boolean) => players.setAllMuted(muted));
    ipcMain.handle(IPC.getPlayerMetrics, () => players.getMetrics());

    ipcMain.handle(IPC.getGpuDisabled, () => settings.getGpuDisabled());
    ipcMain.on(IPC.setGpuDisabled, (_event, disabled: boolean) => {
        settings.setGpuDisabled(disabled);

        if (!app.isPackaged) {
            // `electron-vite dev` tears down its own Vite dev server as soon
            // as this Electron process exits (it treats that as "the
            // developer closed the app for the session"). A self-triggered
            // relaunch here would spawn a new window pointed at
            // ELECTRON_RENDERER_URL with nothing left listening on it -
            // blank window, not a crash, just nothing to load. Only safe to
            // auto-relaunch in a packaged build; in dev, save the setting
            // and ask for a manual restart instead of an unreliable one.
            void dialog.showMessageBox(win, {
                type: 'info',
                message: 'GPU setting saved.',
                detail: 'Stop and restart `npm run dev` for this to take effect - auto-relaunch only works in a packaged build.',
            });
            return;
        }

        app.relaunch();
        app.exit();
    });

    players.on('changed', (list) => {
        win.webContents.send(IPC.playersChanged, list);
    });

    players.on('state-changed', (states) => {
        win.webContents.send(IPC.playerStateChanged, states);
    });

    ipcMain.handle(IPC.pickZipFile, async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: 'Select a player-server or player-ui archive',
            properties: ['openFile'],
            filters: [{ name: 'Archives & disk images', extensions: ['zip', 'img'] }],
        });
        return canceled ? null : (filePaths[0] ?? null);
    });

    ipcMain.handle(IPC.getDockerRepoPath, () => settings.getDockerRepoPath());

    ipcMain.handle(IPC.setDockerRepoPath, async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: 'Select the player-swarm-docker folder',
            properties: ['openDirectory'],
        });
        if (canceled || !filePaths[0]) return settings.getDockerRepoPath();

        const chosen = filePaths[0];
        if (!existsSync(join(chosen, 'swarm-build.js'))) {
            throw new Error(`${chosen} doesn't look like player-swarm-docker - swarm-build.js not found there.`);
        }
        settings.setDockerRepoPath(chosen);
        return chosen;
    });

    ipcMain.handle(IPC.buildInstance, async (_event, request: BuildInstanceRequest) => {
        const dockerRepoPath = settings.getDockerRepoPath();
        if (!dockerRepoPath) {
            throw new Error('Set the player-swarm-docker folder location first (Settings).');
        }
        return buildInstance(win, dockerRepoPath, request);
    });

    const playerMenu = new PlayerContextMenu(win, (id) => players.list().some((player) => player.id === id));
    players.on('changed', () => playerMenu.validatePlayer());
    ipcMain.on(IPC.showToolbarMenu, (_event, request: ShowToolbarMenuRequest) => {
        if (request.kind === 'player') playerMenu.show(request);
        else { playerMenu.hide(); showToolbarMenu(win, request); }
    });
}

app.whenReady().then(() => {
    const win = createShellWindow();
    const players = new PlayerManager(win);
    players.restoreAll();
    registerIpcHandlers(win, players);
    registerInstanceConsole(win, players);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createShellWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
