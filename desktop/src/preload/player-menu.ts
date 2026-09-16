import { contextBridge, ipcRenderer } from 'electron';
import type { PlayerMenuAPI, PlayerMenuData } from '../shared/playerMenu';

// Self-contained sandbox preload: do not share runtime imports with other preloads.
const api: PlayerMenuAPI = {
    initial: () => ipcRenderer.invoke('player-menu:initial'),
    ready: (token) => ipcRenderer.send('player-menu:ready', token),
    choose: (token, action) => ipcRenderer.send('player-menu:choose', token, action),
    dismiss: (token) => ipcRenderer.send('player-menu:dismiss', token),
    onUpdate: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, data: PlayerMenuData) => callback(data);
        ipcRenderer.on('player-menu:update', listener);
        return () => ipcRenderer.removeListener('player-menu:update', listener);
    },
};
contextBridge.exposeInMainWorld('playerMenu', api);
