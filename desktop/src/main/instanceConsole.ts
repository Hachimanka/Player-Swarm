import { BrowserWindow, clipboard, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { CONSOLE_IPC as C, type ConsoleEvent, type ConsoleInfo, type LogOptions } from '../shared/instanceConsole';
import { InstanceDocker } from './instanceDocker';
import type { PlayerManager } from './playerManager';
import { getDockerRepoPath } from './settings';

const MAX_TEXT = 2 * 1024 * 1024;
const dimensions = (cols: number, rows: number) => {
    if (![cols, rows].every((n) => Number.isInteger(n) && n >= 2 && n <= 500)) throw new Error('Invalid terminal size.');
};

export class ConsoleSession {
    info?: ConsoleInfo;
    service?: string;
    removed = false;
    private closed = false;
    private log?: ChildProcess;
    private shell?: Awaited<ReturnType<InstanceDocker['shell']>>;
    private logEpoch = 0;
    private terminalEpoch = 0;
    private selectionEpoch = 0;
    private logGeneration = 0;
    private terminalGeneration = 0;
    private terminalPending = 0;
    private options?: LogOptions;
    private polling = false;
    private readonly timer: NodeJS.Timeout;
    private readonly flushTimer: NodeJS.Timeout;
    private pendingLogs = '';
    private readonly docker = new InstanceDocker();

    constructor(readonly win: BrowserWindow, readonly playerId: string, private players: PlayerManager) {
        this.timer = setInterval(() => void this.poll(), 4000);
        this.flushTimer = setInterval(() => this.flush(), 50);
        win.on('closed', () => this.dispose());
        win.webContents.on('render-process-gone', () => this.dispose());
        win.webContents.on('did-start-loading', () => { this.stopLogs(); this.stopTerminal(); });
    }

    send(event: ConsoleEvent) {
        if (!this.closed && !this.win.isDestroyed()) this.win.webContents.send(C.event, event);
    }

    private status(target: 'logs' | 'terminal', message: string) {
        this.send({ type: 'status', target, message, generation: target === 'logs' ? this.logGeneration : this.terminalGeneration });
    }

    checkPlayer() {
        const player = this.players.list().find((p) => p.id === this.playerId);
        if (!player || this.removed) {
            this.removed = true;
            this.stopLogs(); this.stopTerminal();
            this.send({ type: 'removed' });
            throw new Error('Player instance no longer exists.');
        }
        if (this.closed) throw new Error('Console is closed.');
        return player;
    }

    async inspect() {
        const selection = this.selectionEpoch;
        const info = await this.docker.inspect(this.checkPlayer(), getDockerRepoPath(), this.service);
        this.checkPlayer();
        if (selection !== this.selectionEpoch) throw new Error('Service selection changed.');
        this.service = info.service;
        this.info = info;
        this.win.setTitle(`${info.playerName} — Instance Console`);
        return info;
    }

    async select(service: string) {
        if (typeof service !== 'string' || !this.info?.services.includes(service)) throw new Error('Invalid service.');
        this.selectionEpoch++;
        this.stopLogs(); this.stopTerminal();
        this.service = service;
        this.info = undefined;
        return this.inspect();
    }

    private flush() {
        if (!this.pendingLogs) return;
        this.send({ type: 'logs', generation: this.logGeneration, data: this.pendingLogs });
        this.pendingLogs = '';
        this.log?.stdout?.resume(); this.log?.stderr?.resume();
    }

    stopLogs() {
        this.logEpoch++;
        this.options = undefined;
        this.log?.kill(); this.log = undefined;
        this.pendingLogs = '';
    }

    async logs(options: LogOptions, generation: number) {
        if (!options || !Number.isInteger(options.tail) || options.tail < 0 || options.tail > 10000 ||
            typeof options.follow !== 'boolean' || typeof options.timestamps !== 'boolean' || !Number.isSafeInteger(generation)) {
            throw new Error('Invalid log options.');
        }
        this.stopLogs();
        const epoch = this.logEpoch;
        this.logGeneration = generation;
        this.options = options;
        this.status('logs', 'Connecting…');
        const info = await this.inspect();
        if (epoch !== this.logEpoch) return;
        const child = this.docker.logs(info.containerId, options);
        this.log = child;
        const accept = (data: string) => {
            if (epoch !== this.logEpoch) return;
            this.pendingLogs += data;
            if (this.pendingLogs.length > 256 * 1024) { child.stdout?.pause(); child.stderr?.pause(); }
        };
        for (const source of [child.stdout, child.stderr]) {
            const decoder = new StringDecoder('utf8');
            source?.on('data', (chunk: Buffer) => accept(decoder.write(chunk)));
            source?.on('end', () => accept(decoder.end()));
        }
        child.on('spawn', () => {
            if (epoch === this.logEpoch) this.status('logs', options.follow ? 'Connected · following' : 'Loading history…');
        });
        child.on('error', () => {
            if (epoch === this.logEpoch) this.status('logs', 'Docker unavailable — reconnect');
        });
        child.on('close', (code) => {
            if (epoch !== this.logEpoch) return;
            this.flush(); this.log = undefined;
            this.status('logs', options.follow ? 'Container disconnected — reconnecting…' : code === 0 ? 'History loaded · follow stopped' : 'Docker unavailable — reconnect');
        });
    }

    stopTerminal() {
        this.terminalEpoch++;
        this.terminalPending = 0;
        // Release the Docker attachment. This does not stop the container.
        this.shell?.stream.destroy(); this.shell = undefined;
    }

    async terminal(generation: number, cols: number, rows: number) {
        dimensions(cols, rows);
        if (!Number.isSafeInteger(generation)) throw new Error('Invalid terminal session.');
        this.stopTerminal();
        const epoch = this.terminalEpoch;
        this.terminalGeneration = generation;
        const info = await this.inspect();
        if (epoch !== this.terminalEpoch) return;
        if (info.status !== 'running') throw new Error('Container is not running.');
        const shell = await this.docker.shell(info.containerId, cols, rows);
        if (epoch !== this.terminalEpoch) { shell.stream.destroy(); return; }
        this.shell = shell;
        const decoder = new StringDecoder('utf8');
        shell.stream.on('data', (data: Buffer) => {
            if (epoch !== this.terminalEpoch) return;
            const text = decoder.write(data);
            this.terminalPending += text.length;
            this.send({ type: 'terminal', generation, data: text });
            if (this.terminalPending > 256 * 1024) shell.stream.pause();
        });
        const ended = () => {
            if (epoch !== this.terminalEpoch) return;
            this.stopTerminal();
            this.status('terminal', 'Shell disconnected. Reconnect to open a new shell.');
        };
        shell.stream.on('error', ended);
        shell.stream.on('end', ended);
        shell.stream.on('close', ended);
        this.status('terminal', `Connected inside ${info.containerName}`);
    }

    input(data: string) {
        this.checkPlayer();
        if (typeof data !== 'string' || data.length > 65536) throw new Error('Invalid terminal input.');
        this.shell?.stream.write(data);
    }

    resize(cols: number, rows: number) {
        dimensions(cols, rows);
        void this.shell?.execution.resize({ w: cols, h: rows }).catch(() => undefined);
    }

    acknowledge(generation: number, characters: number) {
        if (generation !== this.terminalGeneration || !Number.isInteger(characters) || characters < 0 || characters > this.terminalPending) return;
        this.terminalPending -= characters;
        if (this.terminalPending < 64 * 1024) this.shell?.stream.resume();
    }

    private async poll() {
        if (this.polling || this.closed || this.removed) return;
        this.polling = true;
        const selection = this.selectionEpoch;
        try {
            const previous = this.info;
            const info = await this.inspect();
            if (previous && (previous.containerId !== info.containerId || previous.started !== info.started || info.status !== 'running')) {
                this.stopTerminal();
                this.status('terminal', 'Container restarted or stopped. Reconnect to open a new shell.');
                if (this.options?.follow) {
                    this.log?.kill(); this.log = undefined;
                    this.logEpoch++;
                    this.status('logs', 'Container restarted — reconnecting…');
                }
            }
            if (this.options?.follow && !this.log && info.status === 'running') {
                // Include recent startup output produced while Docker was disconnected.
                // Mark the history boundary so repeated lines are understandable.
                const options = this.options;
                await this.logs(options, this.logGeneration);
                this.send({ type: 'logs', generation: this.logGeneration, data: '\n--- Reconnected: recent container history follows ---\n' });
            }
            if (info.status === 'running') Object.assign(info, await this.docker.stats(info.containerId).catch(() => ({})));
            if (selection === this.selectionEpoch && !this.removed) this.send({ type: 'info', info });
        } catch (error) {
            if (selection === this.selectionEpoch && !this.removed) {
                this.stopTerminal();
                this.status('logs', error instanceof Error ? error.message : 'Docker unavailable — reconnect');
                this.status('terminal', 'Container unavailable. Reconnect when Docker is ready.');
            }
        } finally { this.polling = false; }
    }

    dispose() {
        this.closed = true;
        clearInterval(this.timer); clearInterval(this.flushTimer);
        this.stopLogs(); this.stopTerminal();
    }
}

export function registerInstanceConsole(shell: BrowserWindow, players: PlayerManager) {
    const sessions = new Map<number, ConsoleSession>();
    const get = (event: IpcMainInvokeEvent) => {
        const session = sessions.get(event.sender.id);
        if (!session || event.senderFrame !== event.sender.mainFrame) throw new Error('Unauthorized console sender.');
        session.checkPlayer();
        return session;
    };
    ipcMain.handle(C.open, (event, playerId: string) => {
        if (event.sender !== shell.webContents || event.senderFrame !== shell.webContents.mainFrame) throw new Error('Unauthorized sender.');
        const player = players.list().find((p) => p.id === playerId);
        if (!player?.instanceName) throw new Error('This player has no Docker instance.');
        const existing = [...sessions.values()].find((s) => s.playerId === playerId);
        if (existing) { existing.win.show(); existing.win.focus(); return; }
        const win = new BrowserWindow({ width: 1050, height: 740, minWidth: 720, minHeight: 440,
            title: 'Instance Console', backgroundColor: '#0f1115',
            webPreferences: { preload: join(__dirname, '../preload/console.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
        });
        win.setMenu(null);
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        win.webContents.on('will-navigate', (event) => event.preventDefault());
        const id = win.webContents.id;
        sessions.set(id, new ConsoleSession(win, playerId, players));
        win.on('closed', () => sessions.delete(id));
        const url = process.env.ELECTRON_RENDERER_URL;
        if (url) void win.loadURL(`${url.replace(/\/$/, '')}/console.html`);
        else void win.loadFile(join(__dirname, '../renderer/console.html'));
    });
    ipcMain.handle(C.inspect, (e) => get(e).inspect());
    ipcMain.handle(C.select, (e, service: string) => get(e).select(service));
    ipcMain.handle(C.logs, (e, options: LogOptions, generation: number) => get(e).logs(options, generation));
    ipcMain.handle(C.stopLogs, (e) => get(e).stopLogs());
    ipcMain.handle(C.terminal, (e, generation: number, cols: number, rows: number) => get(e).terminal(generation, cols, rows));
    ipcMain.handle(C.stopTerminal, (e) => get(e).stopTerminal());
    ipcMain.on(C.input, (e, data: string) => { try { get(e).input(data); } catch { /* Reject untrusted/stale input. */ } });
    ipcMain.on(C.resize, (e, cols: number, rows: number) => { try { get(e).resize(cols, rows); } catch { /* Reject invalid sizes. */ } });
    ipcMain.on(C.acknowledge, (e, generation: number, characters: number) => { try { get(e).acknowledge(generation, characters); } catch { /* Ignore stale acknowledgements. */ } });
    const text = (value: unknown): string => {
        if (typeof value !== 'string' || value.length > MAX_TEXT) throw new Error('Log output exceeds the export limit.');
        return value;
    };
    ipcMain.handle(C.copy, (e, value: unknown) => { get(e); clipboard.writeText(text(value)); });
    ipcMain.handle(C.export, async (e, value: unknown) => {
        const session = get(e);
        const content = text(value);
        const result = await dialog.showSaveDialog(session.win, { title: 'Export displayed logs',
            defaultPath: `${session.info?.instanceName || 'instance'}-${session.service || 'logs'}.log`,
            filters: [{ name: 'Log files', extensions: ['log', 'txt'] }],
        });
        if (result.canceled || !result.filePath) return false;
        await writeFile(result.filePath, content, 'utf8');
        return true;
    });
    players.on('changed', () => {
        for (const session of sessions.values()) { try { session.checkPlayer(); } catch { /* Session disabled. */ } }
    });
    shell.on('closed', () => { for (const session of sessions.values()) session.win.close(); });
}
