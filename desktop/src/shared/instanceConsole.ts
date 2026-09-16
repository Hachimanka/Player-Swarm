export interface ConsoleInfo {
    playerId: string;
    playerName: string;
    instanceName: string;
    directory: string;
    project: string;
    services: string[];
    service: string;
    containerId: string;
    containerName: string;
    image: string;
    imageId: string;
    imageTag: string;
    status: string;
    created: string;
    started: string;
    ports: string[];
    cpu?: string;
    memory?: string;
}

export interface LogOptions { tail: number; follow: boolean; timestamps: boolean }
export type ConsoleEvent =
    | { type: 'logs' | 'terminal'; generation: number; data: string }
    | { type: 'status'; target: 'logs' | 'terminal'; generation: number; message: string }
    | { type: 'removed' }
    | { type: 'info'; info: ConsoleInfo };

/** No player/container/command argument: the main process binds this bridge to one window. */
export interface InstanceConsoleAPI {
    inspect(): Promise<ConsoleInfo>;
    selectService(service: string): Promise<ConsoleInfo>;
    logs(options: LogOptions, generation: number): Promise<void>;
    stopLogs(): Promise<void>;
    terminal(generation: number, columns: number, rows: number): Promise<void>;
    stopTerminal(): Promise<void>;
    input(data: string): void;
    resize(columns: number, rows: number): void;
    acknowledgeTerminal(generation: number, characters: number): void;
    copy(text: string): Promise<void>;
    export(text: string): Promise<boolean>;
    onEvent(callback: (event: ConsoleEvent) => void): () => void;
}

export const CONSOLE_IPC = {
    open: 'instance-console:open', inspect: 'instance-console:inspect',
    select: 'instance-console:select', logs: 'instance-console:logs', stopLogs: 'instance-console:stop-logs',
    terminal: 'instance-console:terminal', stopTerminal: 'instance-console:stop-terminal',
    input: 'instance-console:input', resize: 'instance-console:resize',
    acknowledge: 'instance-console:acknowledge',
    copy: 'instance-console:copy', export: 'instance-console:export', event: 'instance-console:event',
} as const;
