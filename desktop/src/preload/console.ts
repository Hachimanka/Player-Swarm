import { contextBridge, ipcRenderer } from 'electron';
import type { InstanceConsoleAPI, ConsoleEvent } from '../shared/instanceConsole';

// Keep this sandboxed preload self-contained. Sharing runtime imports with the
// shell preload creates Rollup chunks that Electron's sandbox cannot require.
const channel = (name: string) => `instance-console:${name}`;

const api: InstanceConsoleAPI = {
    inspect: () => ipcRenderer.invoke(channel('inspect')),
    selectService: (service) => ipcRenderer.invoke(channel('select'), service),
    logs: (options, generation) => ipcRenderer.invoke(channel('logs'), options, generation),
    stopLogs: () => ipcRenderer.invoke(channel('stop-logs')),
    terminal: (generation, cols, rows) => ipcRenderer.invoke(channel('terminal'), generation, cols, rows),
    stopTerminal: () => ipcRenderer.invoke(channel('stop-terminal')),
    input: (data) => ipcRenderer.send(channel('input'), data),
    resize: (cols, rows) => ipcRenderer.send(channel('resize'), cols, rows),
    acknowledgeTerminal: (generation, characters) => ipcRenderer.send(channel('acknowledge'), generation, characters),
    copy: (text) => ipcRenderer.invoke(channel('copy'), text),
    export: (text) => ipcRenderer.invoke(channel('export'), text),
    onEvent: (callback) => {
        const listener = (_event: Electron.IpcRendererEvent, event: ConsoleEvent) => callback(event);
        ipcRenderer.on(channel('event'), listener);
        return () => ipcRenderer.removeListener(channel('event'), listener);
    },
};
contextBridge.exposeInMainWorld('instanceConsole', api);
