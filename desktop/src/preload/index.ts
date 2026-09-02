import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AddPlayerRequest, type Player, type PlayerSwarmAPI } from '@shared/types';

const api: PlayerSwarmAPI = {
    addPlayer: (url) => ipcRenderer.invoke(IPC.addPlayer, { url } satisfies AddPlayerRequest),

    removePlayer: (id) => ipcRenderer.invoke(IPC.removePlayer, id),

    listPlayers: () => ipcRenderer.invoke(IPC.listPlayers),

    reportGridBounds: (cells) => ipcRenderer.send(IPC.reportGridBounds, cells),

    onPlayersChanged: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, players: Player[]): void => callback(players);
        ipcRenderer.on(IPC.playersChanged, listener);
        return () => ipcRenderer.removeListener(IPC.playersChanged, listener);
    },

    setOverlayVisible: (visible) => ipcRenderer.send(IPC.setOverlayVisible, visible),
};

contextBridge.exposeInMainWorld('playerSwarm', api);
