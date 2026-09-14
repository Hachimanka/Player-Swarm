import { Component, ElementRef, computed, effect, inject, input, output, viewChild, viewChildren } from '@angular/core';
import type { CellBounds, Player, PlayerMetrics, PlayerRuntimeState } from '@shared/types';
import { PlayerCardComponent } from './player-card.component';

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

@Component({
    selector: 'player-grid',
    imports: [PlayerCardComponent],
    template: `
        @if (focusedPlayer(); as focused) {
            <div class="player-focus-layout">
                <div class="player-focus-main">
                    <player-card
                        [player]="focused"
                        [focused]="true"
                        [selected]="selectedIds().has(focused.id)"
                        [runtimeState]="runtimeStates().get(focused.id)"
                        [metrics]="metrics().get(focused.id)"
                        (remove)="remove.emit($event)"
                        (toggleFocus)="onToggleFocus($event)"
                        (toggleSelect)="toggleSelect.emit($event)"
                        (navigate)="navigate.emit($event)"
                        (goBack)="goBack.emit($event)"
                        (goForward)="goForward.emit($event)"
                        (reload)="reload.emit($event)"
                        (stop)="stop.emit($event)"
                        (toggleMute)="toggleMute.emit($event)"
                        (openDevTools)="openDevTools.emit($event)"
                        (rename)="rename.emit($event)" />
                </div>
                @if (otherPlayers().length > 0) {
                    <div class="player-focus-strip" #stripEl>
                        @for (player of otherPlayers(); track player.id) {
                            <player-card
                                [player]="player"
                                [focused]="false"
                                [selected]="selectedIds().has(player.id)"
                                [runtimeState]="runtimeStates().get(player.id)"
                                [metrics]="metrics().get(player.id)"
                                (remove)="remove.emit($event)"
                                (toggleFocus)="onToggleFocus($event)"
                                (toggleSelect)="toggleSelect.emit($event)"
                                (navigate)="navigate.emit($event)"
                                (goBack)="goBack.emit($event)"
                                (goForward)="goForward.emit($event)"
                                (reload)="reload.emit($event)"
                                (stop)="stop.emit($event)"
                                (toggleMute)="toggleMute.emit($event)"
                                (openDevTools)="openDevTools.emit($event)"
                                (rename)="rename.emit($event)" />
                        }
                    </div>
                }
            </div>
        } @else {
            <div
                class="player-grid"
                [style.grid-template-columns]="'repeat(' + dims().columns + ', 1fr)'"
                [style.grid-template-rows]="'repeat(' + dims().rows + ', 1fr)'">
                @for (player of pagedPlayers(); track player.id) {
                    <player-card
                        [player]="player"
                        [focused]="false"
                        [selected]="selectedIds().has(player.id)"
                        [runtimeState]="runtimeStates().get(player.id)"
                        [metrics]="metrics().get(player.id)"
                        (remove)="remove.emit($event)"
                        (toggleFocus)="onToggleFocus($event)"
                        (toggleSelect)="toggleSelect.emit($event)"
                        (navigate)="navigate.emit($event)"
                        (goBack)="goBack.emit($event)"
                        (goForward)="goForward.emit($event)"
                        (reload)="reload.emit($event)"
                        (stop)="stop.emit($event)"
                        (toggleMute)="toggleMute.emit($event)"
                        (openDevTools)="openDevTools.emit($event)"
                        (rename)="rename.emit($event)" />
                }
            </div>
        }
    `,
})
export class GridComponent {
    public readonly players = input.required<Player[]>();
    public readonly columnOverride = input<number | null>(null);
    public readonly pageSize = input<number | null>(null);
    public readonly currentPage = input(0);
    public readonly focusedPlayerId = input<string | null>(null);
    public readonly selectedIds = input<ReadonlySet<string>>(new Set());
    public readonly runtimeStates = input<ReadonlyMap<string, PlayerRuntimeState>>(new Map());
    public readonly metrics = input<ReadonlyMap<string, PlayerMetrics>>(new Map());

    public readonly remove = output<string>();
    public readonly focusChange = output<string | null>();
    public readonly toggleSelect = output<string>();
    public readonly navigate = output<{ id: string; url: string }>();
    public readonly goBack = output<string>();
    public readonly goForward = output<string>();
    public readonly reload = output<string>();
    public readonly stop = output<string>();
    public readonly toggleMute = output<string>();
    public readonly openDevTools = output<string>();
    public readonly rename = output<{ id: string; label: string }>();

    private readonly hostRef = inject(ElementRef<HTMLElement>);
    private readonly cards = viewChildren(PlayerCardComponent);
    private readonly stripEl = viewChild<ElementRef<HTMLElement>>('stripEl');
    private reportScheduled = false;
    private stripScrollCleanup: (() => void) | null = null;

    /** Only the current page's players when pagination (pageSize) is set - unpaginated (null) shows everyone, today's behavior. */
    public readonly pagedPlayers = computed<Player[]>(() => {
        const size = this.pageSize();
        if (!size) return this.players();
        const start = this.currentPage() * size;
        return this.players().slice(start, start + size);
    });

    public readonly dims = computed<GridDimensions>(() => {
        const override = this.columnOverride();
        const count = this.pagedPlayers().length;
        if (override) return { columns: override, rows: Math.ceil(count / override) };
        return computeGridDimensions(count);
    });

    public readonly focusedPlayer = computed<Player | null>(() => {
        const id = this.focusedPlayerId();
        if (!id) return null;
        return this.players().find((p) => p.id === id) ?? null;
    });

    public readonly otherPlayers = computed<Player[]>(() => {
        const focused = this.focusedPlayer();
        if (!focused) return [];
        return this.players().filter((p) => p.id !== focused.id);
    });

    public constructor() {
        new ResizeObserver(() => this.scheduleReport()).observe(this.hostRef.nativeElement);
        window.addEventListener('resize', () => this.scheduleReport());

        effect(() => {
            this.dims();
            this.focusedPlayer();
            this.otherPlayers();
            this.pagedPlayers();
            this.scheduleReport();
        });

        // The thumbnail strip scrolls natively (its header bars are real DOM),
        // but each thumbnail's actual content is a WebContentsView positioned
        // by absolute setBounds() calls - that position only updates when we
        // report it. Without this, scrolling moves the headers while the
        // real content underneath stays frozen at its last reported spot.
        effect(() => {
            this.stripScrollCleanup?.();
            this.stripScrollCleanup = null;

            const el = this.stripEl()?.nativeElement;
            if (!el) return;

            const onScroll = (): void => this.scheduleReport();
            el.addEventListener('scroll', onScroll, { passive: true });
            this.stripScrollCleanup = () => el.removeEventListener('scroll', onScroll);
        });
    }

    public onToggleFocus(id: string): void {
        this.focusChange.emit(this.focusedPlayerId() === id ? null : id);
    }

    private scheduleReport(): void {
        if (this.reportScheduled) return;
        this.reportScheduled = true;
        requestAnimationFrame(() => {
            this.reportScheduled = false;
            this.reportBounds();
        });
    }

    private reportBounds(): void {
        // WebContentsView.setBounds() is relative to the window's content area, which is
        // exactly what viewport-relative getBoundingClientRect() already gives us here.
        // Works unchanged for both layout branches - viewChildren collects every
        // PlayerCardComponent instance regardless of which @if/@else branch rendered it.
        const cells: CellBounds[] = [];
        const stripRect = this.stripEl()?.nativeElement.getBoundingClientRect() ?? null;
        const stripIds = new Set(this.otherPlayers().map((p) => p.id));

        for (const card of this.cards()) {
            const rect = card.body().nativeElement.getBoundingClientRect();
            const id = card.player().id;

            if (stripRect && stripIds.has(id)) {
                // A WebContentsView isn't clipped by the strip's own CSS scroll
                // container the way real DOM content is - a thumbnail only
                // partially scrolled into view would otherwise still render its
                // full rect and bleed out past the strip (e.g. under the
                // toolbar). Hide anything not fully inside the strip's visible
                // viewport instead of letting it bleed.
                const fullyVisible = rect.top >= stripRect.top - 0.5 && rect.bottom <= stripRect.bottom + 0.5;
                if (!fullyVisible) {
                    cells.push({ playerId: id, x: 0, y: 0, width: 0, height: 0 });
                    continue;
                }
            }

            cells.push({ playerId: id, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
        }

        // A player on another page has no PlayerCardComponent at all - it's
        // simply not in this.cards() - so its id would otherwise never be
        // mentioned here. applyBounds() only updates ids it's told about, so
        // an omitted id just keeps whatever bounds it had before (e.g. still
        // visible from the previous page). Explicitly hide everyone not on
        // the current page instead of merely not reporting them. Only
        // applies to the plain grid branch - when focused, every player is
        // already rendered (main + strip), pagination doesn't apply there.
        if (this.pageSize() && !this.focusedPlayer()) {
            const visibleIds = new Set(this.pagedPlayers().map((p) => p.id));
            for (const player of this.players()) {
                if (!visibleIds.has(player.id)) {
                    cells.push({ playerId: player.id, x: 0, y: 0, width: 0, height: 0 });
                }
            }
        }

        window.playerSwarm.reportGridBounds(cells);
    }
}
