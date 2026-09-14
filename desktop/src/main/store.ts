import type { Player } from '@shared/types';
import * as settings from './settings';

/**
 * Registry of the current session's players, backed by the same JSON config
 * file settings.ts already uses (Phase 3 - "Persist layout"). Every add/remove/
 * update writes through immediately rather than only on a clean-shutdown hook,
 * so a crash or force-quit doesn't lose the list either.
 */
export class Store {
    private readonly players = new Map<string, Player>();

    public constructor() {
        for (const player of settings.getPlayers()) {
            // Backward-compat default for players persisted before `muted`
            // existed on the shape - an old settings.json entry won't have it.
            this.players.set(player.id, { ...player, muted: player.muted ?? false });
        }
    }

    public add(player: Player): void {
        this.players.set(player.id, player);
        this.persist();
    }

    public remove(id: string): void {
        this.players.delete(id);
        this.persist();
    }

    /** Merges a partial update (live URL after navigation, muted, label, ...) into an existing player. */
    public update(id: string, patch: Partial<Player>): void {
        const existing = this.players.get(id);
        if (!existing) return;
        this.players.set(id, { ...existing, ...patch });
        this.persist();
    }

    public get(id: string): Player | undefined {
        return this.players.get(id);
    }

    public list(): Player[] {
        return Array.from(this.players.values());
    }

    private persist(): void {
        settings.setPlayers(this.list());
    }
}
