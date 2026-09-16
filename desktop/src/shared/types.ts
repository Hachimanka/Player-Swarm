/** A single isolated Chromium player instance. */
export interface Player {
    id: string;
    url: string;
    partition: string;
    muted: boolean;
    /** Optional display name shown instead of the raw URL. Empty/undefined = show the URL. */
    label?: string;
    /** Optional per-player User-Agent override. Empty/undefined = Chromium's default. */
    userAgent?: string;
    /** Environment this player's instance was built with (e.g. "production"), for display only. */
    env?: string;
    /** License key/ID this player's instance was activated with, for display only. */
    license?: string;
    /**
     * Name of the player-swarm-docker instance (e.g. "instance-42") backing
     * this player, if it was created via Build Instance rather than pointed
     * at an arbitrary URL. When set, choosing "Purge Session Data" on Remove
     * also tears down this instance's Docker containers and data - see
     * main/index.ts's removePlayer/removePlayers handlers.
     */
    instanceName?: string;
}

/**
 * Transient, non-persisted runtime state for a player - loading/error/nav
 * availability. Kept separate from Player (the persisted shape written to
 * settings.json) since none of this should survive a restart; a player that
 * was mid-load or errored when the app closed should just come back idle.
 */
export interface PlayerRuntimeState {
    id: string;
    loading: boolean;
    error: string | null;
    canGoBack: boolean;
    canGoForward: boolean;
    /**
     * True while an automatic relaunch is already scheduled for a crashed
     * player (see PlayerManager.scheduleAutoRelaunch). Distinct from `error`
     * alone, which also covers the terminal case where the retry budget is
     * spent and only a manual Reload can recover it - the card surfaces those
     * as "Recovering" and "Error" respectively.
     */
    recovering: boolean;
}

/** Per-player CPU/memory snapshot from app.getAppMetrics(), keyed by player id. */
export interface PlayerMetrics {
    cpuPercent: number;
    memoryMB: number;
}

/** Pixel bounds of one grid cell, relative to the shell window's content area. */
export interface CellBounds {
    playerId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Request payload for creating a new player. Empty/omitted url defaults to a blank page. */
export interface AddPlayerRequest {
    url?: string;
    userAgent?: string;
    env?: string;
    license?: string;
    /** See Player.instanceName - passed through when a player is created right after a successful buildInstance(). */
    instanceName?: string;
}

/** Result of asking the user whether to purge a removed player's session data. */
export interface RemovePlayerResult {
    removed: boolean;
    purged: boolean;
}

/** Result of a bulk removal - one confirmation dialog covers the whole batch, not one per player. */
export interface RemovePlayersResult {
    removed: number;
    purged: boolean;
}

/**
 * Request payload for building a new player-server/player-ui instance, via
 * player-swarm-docker's swarm-build.js (a thin wrapper this app shells out
 * to rather than reimplementing its Docker/DB orchestration - see that
 * project's ARCHITECTURE.md/TUTORIAL.md). Either a server+ui zip pair, or a
 * single Pi disk image - never both.
 */
export interface BuildInstanceRequest {
    serverZipPath?: string;
    uiZipPath?: string;
    imagePath?: string;
    env?: string;
    license?: string;
}

/** Result once swarm-build.js finishes creating the instance. */
export interface BuildInstanceResult {
    name: string;
    url: string;
}

/**
 * One line of swarm-build.js's own newline-delimited JSON progress output -
 * see that script's header comment for the exact phase sequence. 'log'
 * carries raw stderr passthrough from the underlying build/Docker commands,
 * for display only - not a phase transition.
 */
export interface BuildProgressEvent {
    phase:
        | 'extracting'
        | 'building-server'
        | 'building-ui'
        | 'creating-instance'
        | 'updating-instance'
        | 'removing-instance'
        | 'done'
        | 'error'
        | 'log';
    message?: string;
    name?: string;
    url?: string;
}

/** Result of tearing down a player-swarm-docker instance via remove-instance.sh. */
export interface DeleteInstanceResult {
    deleted: boolean;
}

/**
 * Native-menu replacements for the toolbar's HTML dropdowns (Actions/Remove/
 * Settings/Per Page) - a WebContentsView always stacks above the renderer's own DOM
 * (see playerManager.ts's own header comment), so an HTML popover can never
 * draw over a player, only force it fully hidden while overlapped. A native
 * Electron Menu is composited by the OS window manager instead, sitting
 * above WebContentsView with no stacking conflict at all.
 * The 'player' kind shares this request channel but uses a compact Electron popup window.
 */
export type ToolbarMenuKind = 'actions' | 'remove' | 'settings' | 'layout' | 'player';

/** Dynamic bits the main process needs to build a toolbar menu's labels/states - mirrors what the old HTML popovers read from renderer state. */
export interface ToolbarMenuContext {
    selectedCount?: number;
    /** Total player count - lets the Actions menu label/enable Select all correctly. */
    totalCount?: number;
    gpuDisabled?: boolean;
    dockerRepoLabel?: string;
    /** Currently active page size, or null for unpaginated - drives the Layout menu's Per page radio selection. */
    pageSize?: number | null;
    /** Currently forced column count, or null for the automatic aspect-aware layout - drives the Layout menu's Columns radio selection. */
    columns?: number | null;
    /** Whether every player is currently muted - drives the Actions menu's Mute/Unmute all label. */
    allMuted?: boolean;
    /** The player popup uses its own Electron window above the WebContentsViews. */
    player?: PlayerMenuContext;
}

/** Per-player state the compact popup needs to render correct labels/checkmarks. */
export interface PlayerMenuContext {
    id: string;
    /** Full display name; the popup truncates visible text and retains it in the tooltip. */
    name: string;
    /** Full URL retained for the compact popup's tooltip and copy action. */
    url?: string;
    muted: boolean;
    focused: boolean;
    selected: boolean;
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    /** Whether Remove will also offer to tear down a Docker instance - only affects the item's label. */
    hasInstance: boolean;
}

/** x/y are relative to the window's content area - same coordinate space as CellBounds/getBoundingClientRect() already used elsewhere in this app. */
export interface ShowToolbarMenuRequest {
    kind: ToolbarMenuKind;
    x: number;
    y: number;
    /** Button rectangle in CSS viewport coordinates; omitted for right-clicks. */
    anchor?: import('./playerMenu').MenuRectangle;
    context: ToolbarMenuContext;
}

/** Sent back once a native menu item is clicked - the renderer dispatches this to whichever existing method the old popover item used to call directly. */
export interface ToolbarMenuActionEvent {
    kind: ToolbarMenuKind;
    action: string;
    /** Payload for a radio-style selection (e.g. the chosen column count or page size) - null means "Auto"/unset, undefined means this action carries no value. */
    value?: number | null;
    /** Set only for kind: 'player' - which card the action applies to. */
    playerId?: string;
}

/** Typed surface exposed to the shell renderer via contextBridge. Guest player views get no such bridge. */
export interface PlayerSwarmAPI {
    openInstanceConsole(id: string): Promise<void>;
    addPlayer(url?: string, userAgent?: string, env?: string, license?: string, instanceName?: string): Promise<Player>;
    /** Creates `count` players from the same url, staggered ~150ms apart so bulk-add doesn't block the UI thread. */
    addPlayers(count: number, url?: string): Promise<void>;
    removePlayer(id: string): Promise<RemovePlayerResult>;
    /** Removes several players behind a single Cancel/Keep/Purge confirmation dialog, not one per player. */
    removePlayers(ids: string[]): Promise<RemovePlayersResult>;
    listPlayers(): Promise<Player[]>;
    reportGridBounds(cells: CellBounds[]): void;
    onPlayersChanged(callback: (players: Player[]) => void): () => void;
    onPlayerStateChanged(callback: (states: PlayerRuntimeState[]) => void): () => void;
    setOverlayVisible(visible: boolean): void;

    /** Navigates an existing player to a new URL (the header's editable URL bar). */
    navigatePlayer(id: string, url: string): void;
    goBackPlayer(id: string): void;
    goForwardPlayer(id: string): void;
    reloadPlayer(id: string): void;
    /** Also clears that player's error state, since Reload is the recovery action for a crashed/failed player. */
    stopPlayer(id: string): void;
    setPlayerMuted(id: string, muted: boolean): void;
    openPlayerDevTools(id: string): void;
    renamePlayer(id: string, label: string): void;
    reloadAllPlayers(): void;
    setAllPlayersMuted(muted: boolean): void;
    /** Snapshot of CPU/memory per player, via app.getAppMetrics() mapped by each view's OS process id. */
    getPlayerMetrics(): Promise<Record<string, PlayerMetrics>>;

    /** Whether hardware acceleration is currently disabled (takes effect on next launch). */
    getGpuDisabled(): Promise<boolean>;
    /** Persists the GPU setting for next launch and relaunches the app immediately to apply it. */
    setGpuDisabled(disabled: boolean): void;

    /** Opens a native file picker for a .zip/.img file. Resolves null if cancelled. */
    pickZipFile(): Promise<string | null>;
    /** Resolves the absolute path for a File dropped onto the window - Electron's webUtils.getPathForFile, the current replacement for the removed File.path. */
    getPathForFile(file: File): string;
    /** The saved player-swarm-docker folder location, or null if not set yet. */
    getDockerRepoPath(): Promise<string | null>;
    /** Prompts a directory picker for the player-swarm-docker folder, validates and saves it. Resolves the saved path, or the previous one if cancelled. */
    setDockerRepoPath(): Promise<string | null>;
    /** Runs swarm-build.js against the given archives, streaming progress via onBuildProgress, resolving once the new instance is up and running. */
    buildInstance(request: BuildInstanceRequest): Promise<BuildInstanceResult>;
    onBuildProgress(callback: (event: BuildProgressEvent) => void): () => void;

    /** Opens the player popup window or a native toolbar menu at the supplied anchor. */
    showToolbarMenu(request: ShowToolbarMenuRequest): void;
    onToolbarMenuAction(callback: (event: ToolbarMenuActionEvent) => void): () => void;
}

export const IPC = {
    addPlayer: 'player:add',
    addPlayers: 'player:add-many',
    removePlayer: 'player:remove',
    removePlayers: 'player:remove-many',
    listPlayers: 'player:list',
    reportGridBounds: 'grid:report-bounds',
    playersChanged: 'player:changed',
    playerStateChanged: 'player:state-changed',
    setOverlayVisible: 'ui:set-overlay-visible',
    navigatePlayer: 'player:navigate',
    goBackPlayer: 'player:go-back',
    goForwardPlayer: 'player:go-forward',
    reloadPlayer: 'player:reload',
    stopPlayer: 'player:stop',
    setPlayerMuted: 'player:set-muted',
    openPlayerDevTools: 'player:open-devtools',
    renamePlayer: 'player:rename',
    reloadAllPlayers: 'player:reload-all',
    setAllPlayersMuted: 'player:set-all-muted',
    getPlayerMetrics: 'player:get-metrics',
    getGpuDisabled: 'settings:get-gpu-disabled',
    setGpuDisabled: 'settings:set-gpu-disabled',
    pickZipFile: 'dialog:pick-zip-file',
    getDockerRepoPath: 'settings:get-docker-repo-path',
    setDockerRepoPath: 'settings:set-docker-repo-path',
    buildInstance: 'instance:build',
    buildProgress: 'instance:build-progress',
    showToolbarMenu: 'ui:show-toolbar-menu',
    toolbarMenuAction: 'ui:toolbar-menu-action',
} as const;
