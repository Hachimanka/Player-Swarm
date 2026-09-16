import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { CONSOLE_IPC } from '../shared/instanceConsole';
import {
    IPC,
    type AddPlayerRequest,
    type BuildInstanceRequest,
    type BuildProgressEvent,
    type Player,
    type PlayerRuntimeState,
    type PlayerSwarmAPI,
    type ShowToolbarMenuRequest,
    type ToolbarMenuActionEvent,
} from '@shared/types';

const api: PlayerSwarmAPI = {
    openInstanceConsole: (id) => ipcRenderer.invoke(CONSOLE_IPC.open, id),
    addPlayer: (url, userAgent, env, license, instanceName) =>
        ipcRenderer.invoke(IPC.addPlayer, { url, userAgent, env, license, instanceName } satisfies AddPlayerRequest),

    addPlayers: (count, url) => ipcRenderer.invoke(IPC.addPlayers, count, url),

    removePlayer: (id) => ipcRenderer.invoke(IPC.removePlayer, id),

    removePlayers: (ids) => ipcRenderer.invoke(IPC.removePlayers, ids),

    listPlayers: () => ipcRenderer.invoke(IPC.listPlayers),

    reportGridBounds: (cells) => ipcRenderer.send(IPC.reportGridBounds, cells),

    onPlayersChanged: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, players: Player[]): void => callback(players);
        ipcRenderer.on(IPC.playersChanged, listener);
        return () => ipcRenderer.removeListener(IPC.playersChanged, listener);
    },

    onPlayerStateChanged: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, states: PlayerRuntimeState[]): void => callback(states);
        ipcRenderer.on(IPC.playerStateChanged, listener);
        return () => ipcRenderer.removeListener(IPC.playerStateChanged, listener);
    },

    setOverlayVisible: (visible) => ipcRenderer.send(IPC.setOverlayVisible, visible),

    navigatePlayer: (id, url) => ipcRenderer.send(IPC.navigatePlayer, id, url),
    goBackPlayer: (id) => ipcRenderer.send(IPC.goBackPlayer, id),
    goForwardPlayer: (id) => ipcRenderer.send(IPC.goForwardPlayer, id),
    reloadPlayer: (id) => ipcRenderer.send(IPC.reloadPlayer, id),
    stopPlayer: (id) => ipcRenderer.send(IPC.stopPlayer, id),
    setPlayerMuted: (id, muted) => ipcRenderer.send(IPC.setPlayerMuted, id, muted),
    openPlayerDevTools: (id) => ipcRenderer.send(IPC.openPlayerDevTools, id),
    renamePlayer: (id, label) => ipcRenderer.send(IPC.renamePlayer, id, label),
    reloadAllPlayers: () => ipcRenderer.send(IPC.reloadAllPlayers),
    setAllPlayersMuted: (muted) => ipcRenderer.send(IPC.setAllPlayersMuted, muted),
    getPlayerMetrics: () => ipcRenderer.invoke(IPC.getPlayerMetrics),

    getGpuDisabled: () => ipcRenderer.invoke(IPC.getGpuDisabled),
    setGpuDisabled: (disabled) => ipcRenderer.send(IPC.setGpuDisabled, disabled),

    pickZipFile: () => ipcRenderer.invoke(IPC.pickZipFile),

    // Called synchronously with the File reference straight from the renderer's
    // drop event - webUtils.getPathForFile is Electron's current replacement
    // for the removed File.path, meant to be called from preload exactly like
    // this rather than round-tripped through an async IPC call.
    getPathForFile: (file) => webUtils.getPathForFile(file),

    getDockerRepoPath: () => ipcRenderer.invoke(IPC.getDockerRepoPath),

    setDockerRepoPath: () => ipcRenderer.invoke(IPC.setDockerRepoPath),

    buildInstance: (request: BuildInstanceRequest) => ipcRenderer.invoke(IPC.buildInstance, request),

    onBuildProgress: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, progress: BuildProgressEvent): void => callback(progress);
        ipcRenderer.on(IPC.buildProgress, listener);
        return () => ipcRenderer.removeListener(IPC.buildProgress, listener);
    },

    showToolbarMenu: (request: ShowToolbarMenuRequest) => ipcRenderer.send(IPC.showToolbarMenu, request),

    onToolbarMenuAction: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, event: ToolbarMenuActionEvent): void => callback(event);
        ipcRenderer.on(IPC.toolbarMenuAction, listener);
        return () => ipcRenderer.removeListener(IPC.toolbarMenuAction, listener);
    },
};

contextBridge.exposeInMainWorld('playerSwarm', api);
