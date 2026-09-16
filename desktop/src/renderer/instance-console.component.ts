import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { ConsoleEvent, ConsoleInfo, InstanceConsoleAPI } from '../shared/instanceConsole';

declare global { interface Window { instanceConsole: InstanceConsoleAPI } }

@Component({
    selector: 'instance-console', standalone: true, imports: [FormsModule],
    template: `
        <header class="console-header">
            <h1>{{ info()?.playerName || 'Player' }} <span>Instance Console</span></h1>
            <p>{{ info()?.instanceName || 'Resolving instance…' }} · {{ info()?.project }}</p>
            <p class="console-identity">{{ info()?.containerName }} · {{ info()?.image }}</p>
        </header>
        <nav class="console-tabs" aria-label="Console tabs">
            @for (name of tabs; track name) {
                <button type="button" [class.active]="tab() === name" (click)="setTab(name)">{{ name }}</button>
            }
            <label class="service-label">Service
                <select aria-label="Container service" [ngModel]="info()?.service" (ngModelChange)="selectService($event)" [disabled]="removed() || busy()">
                    @for (service of info()?.services || []; track service) { <option [value]="service">{{ service }}</option> }
                </select>
            </label>
        </nav>
        @if (removed()) { <div class="console-notice" role="alert">Player instance no longer exists.</div> }
        @if (error()) { <div class="console-notice" role="alert">{{ error() }}</div> }
        <section class="console-pane" [hidden]="tab() !== 'Logs'">
            <div class="console-controls">
                <input class="log-search" aria-label="Search logs" placeholder="Search logs…" [ngModel]="search()" (ngModelChange)="search.set($event)" />
                <label>Last <input type="number" min="0" max="10000" aria-label="Last N lines" [(ngModel)]="tail" (change)="reconnectLogs()" [disabled]="removed() || busy()" /> lines</label>
                <label><input type="checkbox" [(ngModel)]="timestamps" (change)="reconnectLogs()" [disabled]="removed() || busy()" /> Timestamps</label>
                <button type="button" (click)="toggleFollow()" [disabled]="removed() || busy()">{{ following() ? 'Stop following' : 'Follow' }}</button>
                <button type="button" (click)="reconnectLogs()" [disabled]="removed() || busy()">Reconnect</button>
                <button type="button" (click)="copy()">Copy</button>
                <button type="button" (click)="exportLogs()">Export</button>
                <button type="button" (click)="output.set('')">Clear</button>
            </div>
            <pre #logOutput class="console-log" tabindex="0" aria-label="Docker stdout and stderr">{{ filtered() }}</pre>
            <footer><span>{{ logStatus() }}</span><span>{{ lineCount() }} lines · {{ search() ? 'filtered · ' : '' }}2 MB display limit</span></footer>
        </section>
        <section class="console-pane" [hidden]="tab() !== 'Terminal'">
            <div class="console-controls">
                <span>Container shell · {{ info()?.service }} · /bin/sh</span>
                <button type="button" (click)="connectTerminal()" [disabled]="removed() || busy()">Reconnect</button>
                <button type="button" (click)="disconnectTerminal()">Disconnect</button>
            </div>
            <div #terminalHost class="console-terminal"></div>
            <footer>{{ terminalStatus() }}</footer>
        </section>
        <section class="console-pane console-info" [hidden]="tab() !== 'Info'">
            <p>Live container details · refreshed every four seconds</p>
            <dl>
                @for (row of infoRows(); track row[0]) { <dt>{{ row[0] }}</dt><dd>{{ row[1] }}</dd> }
            </dl>
            <p>Logs come from Docker stdout/stderr. PM2 remains available inside Terminal.</p>
        </section>
    `,
})
export class InstanceConsoleComponent implements AfterViewInit, OnDestroy {
    @ViewChild('terminalHost', { static: true }) terminalHost!: ElementRef<HTMLDivElement>;
    @ViewChild('logOutput', { static: true }) logOutput!: ElementRef<HTMLPreElement>;
    readonly tabs = ['Logs', 'Terminal', 'Info'] as const;
    readonly tab = signal<'Logs' | 'Terminal' | 'Info'>('Logs');
    readonly info = signal<ConsoleInfo | null>(null);
    readonly error = signal('');
    readonly removed = signal(false);
    readonly busy = signal(false);
    readonly output = signal('');
    readonly search = signal('');
    readonly following = signal(true);
    readonly logStatus = signal('Connecting…');
    readonly terminalStatus = signal('Open Terminal to connect inside this container.');
    readonly filtered = computed(() => {
        const query = this.search().toLowerCase();
        return query ? this.output().split('\n').filter((line) => line.toLowerCase().includes(query)).join('\n') : this.output();
    });
    readonly lineCount = computed(() => this.output() ? this.output().split('\n').length : 0);
    readonly infoRows = computed(() => {
        const i = this.info();
        if (!i) return [];
        const uptime = i.status === 'running' ? `${Math.max(0, Math.floor((Date.now() - Date.parse(i.started)) / 1000))} seconds` : 'Not running';
        return [
            ['Player', i.playerName], ['Player ID', i.playerId], ['Instance ID', i.instanceName],
            ['Compose project', i.project], ['Service', i.service], ['Container ID', i.containerId],
            ['Container name', i.containerName], ['Image', i.image], ['Image tag / digest', i.imageTag],
            ['Image ID', i.imageId], ['Status', i.status], ['Created', i.created], ['Started', i.started], ['Uptime', uptime],
            ['Ports', i.ports.join('\n') || 'None'], ['CPU', i.cpu || 'Unavailable'], ['RAM', i.memory || 'Unavailable'],
            ['Instance directory', i.directory],
        ];
    });
    tail = 100;
    timestamps = true;
    private logGeneration = 0;
    private terminalGeneration = 0;
    private terminalStarted = false;
    private terminal?: Terminal;
    private fit = new FitAddon();
    private observer?: ResizeObserver;
    private unsubscribe?: () => void;

    async ngAfterViewInit() {
        this.unsubscribe = window.instanceConsole.onEvent((event) => this.receive(event));
        this.terminal = new Terminal({ theme: { background: '#0f1115', foreground: '#e4e7ec' },
            fontFamily: 'Consolas, monospace', fontSize: 13, cursorBlink: true, scrollback: 5000 });
        this.terminal.loadAddon(this.fit);
        this.terminal.open(this.terminalHost.nativeElement);
        this.terminal.onData((data) => { if (!this.removed()) window.instanceConsole.input(data); });
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(this.terminalHost.nativeElement);
        await this.run(async () => { this.info.set(await window.instanceConsole.inspect()); await this.startLogs(); });
    }

    private async run(action: () => Promise<unknown>) {
        this.error.set('');
        try { await action(); } catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
    }

    private receive(event: ConsoleEvent) {
        if (event.type === 'removed') {
            this.removed.set(true); this.logGeneration++; this.terminalGeneration++;
            this.logStatus.set('Player instance no longer exists.');
            this.terminalStatus.set('Player instance no longer exists.');
            this.terminal?.options && (this.terminal.options.disableStdin = true);
        } else if (event.type === 'info') {
            if (!this.busy() && (!this.info() || this.info()?.service === event.info.service)) this.info.set(event.info);
        } else if (event.type === 'logs' && event.generation === this.logGeneration) {
            // Render plain text, never HTML/ANSI links or terminal control sequences.
            const clean = event.data.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
            this.output.update((value) => (value + clean).slice(-2 * 1024 * 1024));
            if (this.following()) requestAnimationFrame(() => {
                const el = this.logOutput.nativeElement; el.scrollTop = el.scrollHeight;
            });
        } else if (event.type === 'terminal' && event.generation === this.terminalGeneration) {
            this.terminal?.write(event.data, () => window.instanceConsole.acknowledgeTerminal(event.generation, event.data.length));
        } else if (event.type === 'status') {
            if (event.target === 'logs' && event.generation === this.logGeneration) this.logStatus.set(event.message);
            if (event.target === 'terminal' && event.generation === this.terminalGeneration) this.terminalStatus.set(event.message);
        }
    }

    setTab(tab: 'Logs' | 'Terminal' | 'Info') {
        this.tab.set(tab);
        if (tab === 'Terminal') requestAnimationFrame(() => {
            this.resize();
            if (!this.terminalStarted && !this.removed()) void this.connectTerminal();
            this.terminal?.focus();
        });
    }

    async selectService(service: string) {
        this.busy.set(true); this.logGeneration++; this.terminalGeneration++;
        this.info.set(null);
        this.output.set(''); this.terminal?.reset(); this.terminalStarted = false;
        await this.run(async () => {
            this.info.set(await window.instanceConsole.selectService(service));
            await this.startLogs();
            if (this.tab() === 'Terminal') await this.connectTerminal();
        });
        this.busy.set(false);
    }

    private async startLogs() {
        await window.instanceConsole.logs({ tail: this.tail, follow: this.following(), timestamps: this.timestamps }, ++this.logGeneration);
    }

    async reconnectLogs() {
        this.output.set('');
        await this.run(() => this.startLogs());
    }

    async toggleFollow() {
        this.following.update((value) => !value);
        if (this.following()) await this.reconnectLogs();
        else {
            this.logGeneration++;
            await this.run(() => window.instanceConsole.stopLogs());
            this.logStatus.set('Follow stopped');
        }
    }

    async connectTerminal() {
        this.terminalStarted = true;
        this.terminalStatus.set('Connecting…');
        this.terminal?.reset(); this.resize();
        await this.run(() => window.instanceConsole.terminal(++this.terminalGeneration, this.terminal?.cols || 80, this.terminal?.rows || 24));
        this.terminal?.focus();
    }

    async disconnectTerminal() {
        this.terminalGeneration++;
        await this.run(() => window.instanceConsole.stopTerminal());
        this.terminalStatus.set('Shell disconnected');
    }

    private resize() {
        if (this.tab() !== 'Terminal' || !this.terminal || this.removed()) return;
        this.fit.fit();
        window.instanceConsole.resize(this.terminal.cols, this.terminal.rows);
    }

    async copy() { await this.run(() => window.instanceConsole.copy(this.filtered())); }
    async exportLogs() { await this.run(() => window.instanceConsole.export(this.filtered())); }
    ngOnDestroy() { this.unsubscribe?.(); this.observer?.disconnect(); this.terminal?.dispose(); }
}
