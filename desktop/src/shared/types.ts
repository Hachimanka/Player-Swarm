/** A single isolated Chromium player instance. */
export interface Player {
    id: string;
    url: string;
    partition: string;
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
}

/** Result of asking the user whether to purge a removed player's session data. */
export interface RemovePlayerResult {
    removed: boolean;
    purged: boolean;
}

/** Typed surface exposed to the shell renderer via contextBridge. Guest player views get no such bridge. */
export interface PlayerSwarmAPI {
    addPlayer(url?: string): Promise<Player>;
    removePlayer(id: string): Promise<RemovePlayerResult>;
    listPlayers(): Promise<Player[]>;
    reportGridBounds(cells: CellBounds[]): void;
    onPlayersChanged(callback: (players: Player[]) => void): () => void;
    setOverlayVisible(visible: boolean): void;
}

export const IPC = {
    addPlayer: 'player:add',
    removePlayer: 'player:remove',
    listPlayers: 'player:list',
    reportGridBounds: 'grid:report-bounds',
    playersChanged: 'player:changed',
    setOverlayVisible: 'ui:set-overlay-visible',
} as const;
