import type { Player } from '@shared/types';

/**
 * In-memory registry of the current session's players.
 * Phase 1 does not persist to disk — Chromium already persists each player's
 * own partition storage under userData; only the "which players existed"
 * list itself needs disk persistence, which is Phase 3 ("Persist layout").
 */
export class Store {
    private readonly players = new Map<string, Player>();

    public add(player: Player): void {
        this.players.set(player.id, player);
    }

    public remove(id: string): void {
        this.players.delete(id);
    }

    public get(id: string): Player | undefined {
        return this.players.get(id);
    }

    public list(): Player[] {
        return Array.from(this.players.values());
    }
}
