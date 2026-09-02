import type { CellBounds, Player } from '@shared/types';
import { createPlayerCard, setPlayerCardLabel } from './playerCard';

interface GridDimensions {
    columns: number;
    rows: number;
}

/** Column/row breakpoints from the product brief. Beyond 12, falls back to a square-ish grid. */
function computeGridDimensions(count: number): GridDimensions {
    if (count <= 0) return { columns: 1, rows: 1 };
    if (count === 1) return { columns: 1, rows: 1 };
    if (count === 2) return { columns: 2, rows: 1 };
    if (count <= 4) return { columns: 2, rows: 2 };
    if (count <= 6) return { columns: 3, rows: 2 };
    if (count <= 9) return { columns: 3, rows: 3 };
    if (count <= 12) return { columns: 4, rows: 3 };

    const columns = Math.ceil(Math.sqrt(count));
    return { columns, rows: Math.ceil(count / columns) };
}

export class Grid {
    private readonly container: HTMLDivElement;
    private readonly cards = new Map<string, HTMLDivElement>();
    private players: Player[] = [];
    private columnOverride: number | null = null;
    private reportTimer: number | null = null;

    public constructor(
        mount: HTMLElement,
        private readonly onRemove: (id: string) => void,
    ) {
        this.container = document.createElement('div');
        this.container.className = 'player-grid';
        mount.appendChild(this.container);

        new ResizeObserver(() => this.scheduleReport()).observe(this.container);
        window.addEventListener('resize', () => this.scheduleReport());
    }

    public setColumnOverride(columns: number | null): void {
        this.columnOverride = columns && columns > 0 ? columns : null;
        this.render();
    }

    public setPlayers(players: Player[]): void {
        this.players = players;
        this.render();
    }

    private render(): void {
        const dims = this.columnOverride
            ? { columns: this.columnOverride, rows: Math.ceil(this.players.length / this.columnOverride) }
            : computeGridDimensions(this.players.length);

        this.container.style.gridTemplateColumns = `repeat(${dims.columns}, 1fr)`;
        this.container.style.gridTemplateRows = `repeat(${Math.max(dims.rows, 1)}, 1fr)`;

        const seen = new Set<string>();
        for (const player of this.players) {
            seen.add(player.id);
            let card = this.cards.get(player.id);
            if (!card) {
                card = createPlayerCard(player, this.onRemove);
                this.cards.set(player.id, card);
                this.container.appendChild(card);
            } else {
                setPlayerCardLabel(card, player);
            }
        }

        for (const [id, card] of this.cards) {
            if (!seen.has(id)) {
                card.remove();
                this.cards.delete(id);
            }
        }

        this.scheduleReport();
    }

    private scheduleReport(): void {
        if (this.reportTimer !== null) return;
        this.reportTimer = window.requestAnimationFrame(() => {
            this.reportTimer = null;
            this.reportBounds();
        });
    }

    private reportBounds(): void {
        // WebContentsView.setBounds() is relative to the window's content area, which is
        // exactly what viewport-relative getBoundingClientRect() already gives us here.
        const cells: CellBounds[] = [];

        for (const [playerId, card] of this.cards) {
            const body = card.querySelector<HTMLElement>('.player-card__body');
            if (!body) continue;
            const rect = body.getBoundingClientRect();
            cells.push({
                playerId,
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
            });
        }

        window.playerSwarm.reportGridBounds(cells);
    }
}
