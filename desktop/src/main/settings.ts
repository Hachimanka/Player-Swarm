import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { Player } from '@shared/types';

/**
 * Small JSON config file in the app's own userData folder - matches the
 * persistence approach already specified for this app's brief
 * (../../INITPROJECT.md §2: "a simple JSON config file... No database.").
 * Holds the player-swarm-docker folder location (so instanceBuilder.ts knows
 * where to find swarm-build.js) and the player list itself (Phase 3 -
 * "Persist layout" - so players survive an app restart instead of only
 * living in PlayerManager's in-memory Store for the run's lifetime).
 */
interface Settings {
    dockerRepoPath?: string;
    players?: Player[];
    gpuDisabled?: boolean;
}

const settingsPath = (): string => join(app.getPath('userData'), 'settings.json');

function readSettings(): Settings {
    try {
        return JSON.parse(readFileSync(settingsPath(), 'utf8')) as Settings;
    } catch {
        return {};
    }
}

export function getDockerRepoPath(): string | null {
    return readSettings().dockerRepoPath ?? null;
}

export function setDockerRepoPath(path: string): void {
    const settings = readSettings();
    settings.dockerRepoPath = path;
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

export function getPlayers(): Player[] {
    return readSettings().players ?? [];
}

export function setPlayers(players: Player[]): void {
    const settings = readSettings();
    settings.players = players;
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * Read synchronously and directly (not via getGpuDisabled(), which would be
 * fine too) - this must be checked before app.whenReady() even fires, since
 * app.disableHardwareAcceleration() is only effective if called before then.
 */
export function getGpuDisabled(): boolean {
    return readSettings().gpuDisabled ?? false;
}

export function setGpuDisabled(disabled: boolean): void {
    const settings = readSettings();
    settings.gpuDisabled = disabled;
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}
