import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { Checkbox } from '@ntv360/component-pantry';
import type { Player, PlayerMetrics, PlayerRuntimeState } from '@shared/types';
import type { PlayerMenuTrigger } from '@shared/playerMenu';
import { IconComponent } from './icon.component';

/**
 * How much header chrome this card can afford, derived from the card's own
 * rendered size rather than the window's - see `density` below. Ordered
 * smallest to largest; the template shows strictly more at each step.
 */
export type CardDensity = 'xs' | 'sm' | 'md' | 'lg';

/** What the status pip communicates at a glance - see `status` for the derivation. */
export type PlayerStatus = 'online' | 'loading' | 'recovering' | 'error' | 'idle';

export const STATUS_LABEL: Record<PlayerStatus, string> = {
    online: 'Running',
    loading: 'Loading',
    recovering: 'Recovering',
    error: 'Error',
    idle: 'Stopped',
};

/**
 * The single definition of what a player's status is, shared by the card's
 * own pip and the toolbar's fleet-wide rollup so the two can never disagree
 * about how many players are "running". `recovering` outranks `error`
 * because a crash with a retry already scheduled is a different situation
 * for an operator than one that has exhausted its retry budget.
 */
export function playerStatusOf(player: Player, state: PlayerRuntimeState | undefined): PlayerStatus {
    if (state?.error) return state.recovering ? 'recovering' : 'error';
    if (state?.loading) return 'loading';
    if (!player.url || player.url === 'about:blank') return 'idle';
    return 'online';
}

/**
 * Card-width breakpoints for the density tiers. These are the card's own
 * width, so a 3-column grid on a wide monitor and a 1-column grid on a narrow
 * one both land wherever their actual cards land - the header never reacts to
 * the window size directly.
 */
const WIDTH_LG = 560;
const WIDTH_MD = 360;
const WIDTH_SM = 210;

/**
 * Height caps. A card can be wide but short (a 6-column x 4-row grid, or the
 * focus strip's thumbnails) - without these, a 400px-wide/90px-tall card would
 * render the `md` toolbar and spend a third of its height on chrome.
 */
const HEIGHT_CAP_SM = 150;
const HEIGHT_CAP_XS = 96;

@Component({
    selector: 'player-card',
    imports: [Checkbox, IconComponent],
    template: `
        <div
            class="player-card"
            [class]="'player-card--' + density()"
            [class.player-card--focused]="focused()"
            [class.player-card--selected]="selected()"
            [class.player-card--errored]="status() === 'error'"
            [attr.data-player-id]="player().id">
            <!--
                Every interactive control lives in this header (or the footer)
                - i.e. strictly OUTSIDE .player-card__body, whose rect is the
                only thing the WebContentsView is positioned over. Nothing in
                this component is ever drawn over a player.
            -->
            <div
                class="player-card__header"
                (dblclick)="toggleFocus.emit(player().id)"
                (contextmenu)="onHeaderContextMenu($event)">
                <div class="player-card__lead">
                    <ntv-checkbox
                        [checked]="selected()"
                        size="sm"
                        color="accent"
                        (dblclick)="$event.stopPropagation()"
                        (checkedChange)="toggleSelect.emit(player().id)" />

                    <span
                        class="player-card__status"
                        [class]="'player-card__status--' + status()"
                        [title]="statusTooltip()"></span>

                    @if (renaming()) {
                        <input
                            #labelInput
                            class="player-card__label-input"
                            [value]="player().label ?? ''"
                            placeholder="Label…"
                            (dblclick)="$event.stopPropagation()"
                            (keydown.enter)="commitRename(labelInput.value)"
                            (keydown.escape)="cancelRename()"
                            (blur)="commitRename(labelInput.value)" />
                    } @else if (density() === 'xs') {
                        <span class="player-card__id" [title]="identityTooltip()" (dblclick)="onLabelDblClick($event)">
                            {{ shortId() }}
                        </span>
                    } @else {
                        <span
                            class="player-card__label"
                            [title]="identityTooltip()"
                            (dblclick)="onLabelDblClick($event)">
                            {{ displayName() }}
                        </span>
                    }
                </div>

                @if (density() === 'lg' || density() === 'md') {
                    <div class="player-card__nav">
                        @if (density() === 'lg') {
                            <button
                                type="button"
                                class="player-card__btn"
                                title="Back"
                                [disabled]="!runtimeState()?.canGoBack"
                                (click)="goBack.emit(player().id)">
                                <ui-icon name="back" />
                            </button>
                            <button
                                type="button"
                                class="player-card__btn"
                                title="Forward"
                                [disabled]="!runtimeState()?.canGoForward"
                                (click)="goForward.emit(player().id)">
                                <ui-icon name="forward" />
                            </button>
                        }

                        @if (runtimeState()?.loading) {
                            <button
                                type="button"
                                class="player-card__btn"
                                title="Stop loading"
                                (click)="stop.emit(player().id)">
                                <ui-icon name="stop" />
                            </button>
                        } @else {
                            <button
                                type="button"
                                class="player-card__btn"
                                title="Reload"
                                (click)="reload.emit(player().id)">
                                <ui-icon name="reload" />
                            </button>
                        }

                        <input
                            #urlInput
                            class="player-card__url"
                            spellcheck="false"
                            [value]="urlDraft()"
                            (dblclick)="$event.stopPropagation()"
                            (focus)="urlFocused.set(true)"
                            (blur)="onUrlBlur()"
                            (keydown.enter)="commitUrl(urlInput.value)" />
                    </div>
                }

                <div class="player-card__actions">
                    @if (density() === 'sm' || density() === 'xs') {
                        @if (runtimeState()?.loading) {
                            <button
                                type="button"
                                class="player-card__btn"
                                title="Stop loading"
                                (click)="stop.emit(player().id)">
                                <ui-icon name="stop" />
                            </button>
                        } @else {
                            <button
                                type="button"
                                class="player-card__btn"
                                title="Reload"
                                (click)="reload.emit(player().id)">
                                <ui-icon name="reload" />
                            </button>
                        }
                    }

                    @if (density() === 'lg' || density() === 'md') {
                        <button
                            type="button"
                            class="player-card__btn"
                            [title]="player().muted ? 'Unmute' : 'Mute'"
                            [class.player-card__btn--active]="player().muted"
                            (click)="toggleMute.emit(player().id)">
                            <ui-icon [name]="player().muted ? 'volumeOff' : 'volumeOn'" />
                        </button>
                    }

                    @if (density() === 'lg' || density() === 'md') {
                        <button
                            type="button"
                            class="player-card__btn"
                            aria-label="Instance Console"
                            [title]="player().instanceName ? 'Instance Console' : 'Instance Console (no Docker instance)'"
                            [disabled]="!player().instanceName"
                            (click)="openInstanceConsole.emit(player().id)">
                            <ui-icon name="terminal" />
                        </button>
                    }

                    <button
                        type="button"
                        class="player-card__btn"
                        [title]="focused() ? 'Restore to grid' : 'Expand'"
                        (click)="toggleFocus.emit(player().id)">
                        <ui-icon [name]="focused() ? 'collapse' : 'expand'" />
                    </button>

                    @if (density() !== 'xs') {
                        <button
                            type="button"
                            class="player-card__btn player-card__btn--danger"
                            title="Remove player"
                            (click)="remove.emit(player().id)">
                            <ui-icon name="close" />
                        </button>
                    }

                    <!--
                        The overflow route for whatever this density tier had
                        to drop, plus DevTools at every tier. A separate
                        Electron popup window - it has to open over the player
                        below it, which no renderer-drawn panel can do.
                        Right-clicking the header reaches the same menu.
                    -->
                    <button
                        type="button"
                        class="player-card__btn"
                        title="More actions"
                        (click)="onMenuButton($event)">
                        <ui-icon name="more" />
                    </button>
                </div>

                @if (runtimeState()?.loading) {
                    <span class="player-card__progress"></span>
                }
            </div>

            @if (runtimeState()?.error; as error) {
                <div class="player-card__error">
                    <span class="player-card__error-icon"><ui-icon name="alert" /></span>
                    <p class="player-card__error-text">{{ error }}</p>
                    @if (status() === 'recovering') {
                        <p class="player-card__error-hint">Retrying automatically…</p>
                    }
                    <button type="button" class="player-card__error-btn" (click)="reload.emit(player().id)">
                        <ui-icon name="reload" />
                        Reload
                    </button>
                </div>
            }

            <div class="player-card__body" #body [attr.data-player-id]="player().id"></div>

            @if (showFooter()) {
                <div class="player-card__footer">
                    <span class="player-card__meta">
                        @if (player().env) {
                            <span class="player-card__meta-value">{{ player().env }}</span>
                        }
                        @if (player().license) {
                            <span class="player-card__meta-value player-card__meta-value--license" [title]="player().license">{{ player().license }}</span>
                        }
                        @if (player().instanceName) {
                            <span class="player-card__meta-value">{{ player().instanceName }}</span>
                        }
                    </span>
                    @if (metrics(); as m) {
                        <span class="player-card__metrics" title="CPU usage · resident memory">
                            <span>{{ m.cpuPercent.toFixed(1) }}%</span>
                            <span>{{ m.memoryMB.toFixed(0) }} MB</span>
                        </span>
                    }
                </div>
            }
        </div>
    `,
})
export class PlayerCardComponent {
    public readonly player = input.required<Player>();
    public readonly focused = input(false);
    public readonly selected = input(false);
    public readonly runtimeState = input<PlayerRuntimeState | undefined>(undefined);
    public readonly metrics = input<PlayerMetrics | undefined>(undefined);
    /** Set by AppComponent when the native card menu's "Rename…" is picked - see the effect in the constructor. */
    public readonly renameTargetId = input<string | null>(null);

    public readonly remove = output<string>();
    public readonly toggleFocus = output<string>();
    public readonly toggleSelect = output<string>();
    public readonly navigate = output<{ id: string; url: string }>();
    public readonly goBack = output<string>();
    public readonly goForward = output<string>();
    public readonly reload = output<string>();
    public readonly stop = output<string>();
    public readonly toggleMute = output<string>();
    public readonly openInstanceConsole = output<string>();
    public readonly rename = output<{ id: string; label: string }>();
    /** Asks AppComponent to open the player popup at this CSS viewport point/button rectangle. */
    public readonly openMenu = output<PlayerMenuTrigger>();
    /** Fired once a rename UI closes, so AppComponent can clear renameTargetId and let a later menu-triggered rename retrigger. */
    public readonly renameClosed = output<string>();

    public readonly body = viewChild.required<ElementRef<HTMLDivElement>>('body');

    public readonly renaming = signal(false);
    public readonly urlDraft = signal('');
    public readonly urlFocused = signal(false);

    private readonly hostRef = inject(ElementRef<HTMLElement>);
    private readonly size = signal<{ width: number; height: number }>({ width: 0, height: 0 });

    /**
     * The card's own compact/normal/full state, measured from this card
     * rather than inferred from column count, page size, or a window-level
     * media query - a card's real width depends on all three at once plus
     * whether it's the focused player or a strip thumbnail, so measuring is
     * both simpler and always right. An expanded player is always `lg`
     * regardless of measurement, so the full toolbar comes back immediately
     * on expand instead of one ResizeObserver frame later.
     *
     * Purely a *rendering* decision: nothing here talks to Electron. The
     * resulting header height change is picked up by GridComponent's own
     * ResizeObserver on .player-card__body, which is what re-reports the
     * WebContentsView bounds - see grid.component.ts.
     */
    public readonly density = computed<CardDensity>(() => {
        if (this.focused()) return 'lg';

        const { width, height } = this.size();
        if (width === 0) return 'sm'; // pre-measurement first frame - start compact, never overflowing

        let tier: CardDensity = 'xs';
        if (width >= WIDTH_LG) tier = 'lg';
        else if (width >= WIDTH_MD) tier = 'md';
        else if (width >= WIDTH_SM) tier = 'sm';

        // A short card can't afford a tall/rich header no matter how wide it is.
        if (height < HEIGHT_CAP_XS) return 'xs';
        if (height < HEIGHT_CAP_SM && (tier === 'lg' || tier === 'md')) return 'sm';
        return tier;
    });

    /** env/license/metrics are worth a whole row only when the card is big enough that the row isn't a meaningful fraction of it. */
    public readonly showFooter = computed(() => {
        if (this.density() === 'xs' || this.density() === 'sm') return false;
        return Boolean(this.player().env || this.player().license || this.player().instanceName || this.metrics());
    });

    public readonly status = computed<PlayerStatus>(() => playerStatusOf(this.player(), this.runtimeState()));

    /** Label if the user set one, else the URL's host - the raw URL is only shown in the URL field itself. */
    public readonly displayName = computed(() => {
        const player = this.player();
        if (player.label) return player.label;
        return hostOf(player.url) ?? player.url;
    });

    /** Ultra-compact identity for `xs`, where there's no room for a host name. */
    public readonly shortId = computed(() => {
        const player = this.player();
        if (player.label) return player.label;
        return `#${player.id.slice(0, 4)}`;
    });

    /**
     * Tooltips carry what the compact tiers drop. Native `title` tooltips
     * rather than an Angular tooltip component on purpose: a renderer-drawn
     * tooltip that happened to extend past the header would be painted over
     * by the player's WebContentsView.
     */
    public readonly identityTooltip = computed(() => {
        const player = this.player();
        const parts = [player.label, player.url, player.env, player.license, player.instanceName];
        return parts.filter(Boolean).join('\n');
    });

    public readonly statusTooltip = computed(() => {
        const lines = [STATUS_LABEL[this.status()]];
        const error = this.runtimeState()?.error;
        if (error) lines.push(error);
        const m = this.metrics();
        if (m) lines.push(`${m.cpuPercent.toFixed(1)}% CPU · ${m.memoryMB.toFixed(0)} MB`);
        return lines.join('\n');
    });

    public constructor() {
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect) this.size.set({ width: rect.width, height: rect.height });
        });
        observer.observe(this.hostRef.nativeElement);

        // Keep the URL bar's draft synced to the live (post-navigation) url,
        // but never clobber what the user is actively typing.
        effect(() => {
            const url = this.player().url;
            if (!this.urlFocused()) this.urlDraft.set(url);
        });

        // "Rename…" in the native card menu - the menu item can't host a text
        // field, so it routes back through AppComponent to open this card's
        // own inline input, the same one a double-click opens.
        effect(() => {
            if (this.renameTargetId() === this.player().id) this.renaming.set(true);
        });
    }

    public onLabelDblClick(event: MouseEvent): void {
        event.stopPropagation(); // don't also toggle focus - see the checkbox's own guard for the same reason
        this.renaming.set(true);
    }

    public commitRename(value: string): void {
        if (!this.renaming()) return; // Escape already closed this; the resulting blur must not re-commit
        this.renaming.set(false);
        this.rename.emit({ id: this.player().id, label: value.trim() });
        this.renameClosed.emit(this.player().id);
    }

    public cancelRename(): void {
        this.renaming.set(false);
        this.renameClosed.emit(this.player().id);
    }

    public onUrlBlur(): void {
        this.urlFocused.set(false);
        this.urlDraft.set(this.player().url); // discard an unsubmitted edit
    }

    public commitUrl(value: string): void {
        this.navigate.emit({ id: this.player().id, url: value });
    }

    /** Preserve the whole button rectangle so the popup can flip above it near screen edges. */
    public onMenuButton(event: MouseEvent): void {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        this.openMenu.emit({ id: this.player().id, x: rect.left, y: rect.bottom,
            anchor: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } });
    }

    /**
     * Right-click anywhere on the card's chrome opens the same player popup at
     * the cursor. Only the header/footer can reach this - a right-click over
     * .player-card__body lands on the guest WebContentsView instead, which is
     * the player's own page and correctly gets its own context menu.
     */
    public onHeaderContextMenu(event: MouseEvent): void {
        event.preventDefault();
        this.openMenu.emit({ id: this.player().id, x: event.clientX, y: event.clientY });
    }
}

/** Bare host for display (www. stripped), or null for about:blank/unparseable urls. */
function hostOf(url: string): string | null {
    try {
        const host = new URL(url).hostname;
        return host ? host.replace(/^www\./, '') : null;
    } catch {
        return null;
    }
}
