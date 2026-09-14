import { Component, ElementRef, effect, input, output, signal, viewChild } from '@angular/core';
import { Button, Checkbox } from '@ntv360/component-pantry';
import type { Player, PlayerMetrics, PlayerRuntimeState } from '@shared/types';

@Component({
    selector: 'player-card',
    imports: [Button, Checkbox],
    template: `
        <div class="player-card" [class.player-card--focused]="focused()" [attr.data-player-id]="player().id">
            <div class="player-card__header" (dblclick)="toggleFocus.emit(player().id)">
                <div class="player-card__title">
                    <ntv-checkbox
                        [checked]="selected()"
                        size="sm"
                        color="accent"
                        (dblclick)="$event.stopPropagation()"
                        (checkedChange)="toggleSelect.emit(player().id)" />

                    @if (renaming()) {
                        <input
                            #labelInput
                            class="player-card__label-input"
                            [value]="player().label ?? ''"
                            placeholder="Label…"
                            (dblclick)="$event.stopPropagation()"
                            (keydown.enter)="commitRename(labelInput.value)"
                            (keydown.escape)="renaming.set(false)"
                            (blur)="commitRename(labelInput.value)" />
                    } @else {
                        <span class="player-card__label" (dblclick)="onLabelDblClick($event)">
                            {{ player().label || player().url }}
                        </span>
                    }

                    @if (runtimeState()?.loading) {
                        <span class="player-card__loading-dot" title="Loading…"></span>
                    }
                </div>

                <div class="player-card__navbar">
                    <button
                        type="button"
                        class="player-card__nav-btn"
                        title="Back"
                        [disabled]="!runtimeState()?.canGoBack"
                        (click)="goBack.emit(player().id)">
                        ◀
                    </button>
                    <button
                        type="button"
                        class="player-card__nav-btn"
                        title="Forward"
                        [disabled]="!runtimeState()?.canGoForward"
                        (click)="goForward.emit(player().id)">
                        ▶
                    </button>
                    @if (runtimeState()?.loading) {
                        <button
                            type="button"
                            class="player-card__nav-btn"
                            title="Stop"
                            (click)="stop.emit(player().id)">
                            ✕
                        </button>
                    } @else {
                        <button
                            type="button"
                            class="player-card__nav-btn"
                            title="Reload"
                            (click)="reload.emit(player().id)">
                            ⟳
                        </button>
                    }
                    <input
                        #urlInput
                        class="player-card__url-input"
                        [value]="urlDraft()"
                        (focus)="urlFocused.set(true)"
                        (blur)="onUrlBlur()"
                        (keydown.enter)="commitUrl(urlInput.value)" />
                    <button
                        type="button"
                        class="player-card__nav-btn"
                        [title]="player().muted ? 'Unmute' : 'Mute'"
                        (click)="toggleMute.emit(player().id)">
                        {{ player().muted ? '🔇' : '🔊' }}
                    </button>
                    <button
                        type="button"
                        class="player-card__nav-btn"
                        title="DevTools"
                        (click)="openDevTools.emit(player().id)">
                        ⚙
                    </button>
                </div>

                <div class="player-card__actions">
                    <ntv-button
                        variant="secondary"
                        size="xs"
                        [rounded]="'sm'"
                        [title]="focused() ? 'Back to grid' : 'Maximize'"
                        (buttonClick)="toggleFocus.emit(player().id)">
                        {{ focused() ? '⊡' : '⛶' }}
                    </ntv-button>
                    <ntv-button
                        variant="danger"
                        size="xs"
                        [rounded]="'sm'"
                        [title]="
                            player().instanceName
                                ? 'Remove player (Purge also deletes its Docker instance)'
                                : 'Remove player'
                        "
                        (buttonClick)="remove.emit(player().id)">
                        ✕
                    </ntv-button>
                </div>
            </div>

            @if (runtimeState()?.error; as error) {
                <div class="player-card__error">
                    <p>{{ error }}</p>
                    <ntv-button variant="primary" size="xs" (buttonClick)="reload.emit(player().id)">Reload</ntv-button>
                </div>
            }

            <div class="player-card__body" #body [attr.data-player-id]="player().id"></div>

            @if (player().env || player().license || metrics()) {
                <div class="player-card__footer">
                    @if (player().env || player().license) {
                        <span class="player-card__meta">
                            @if (player().env) {
                                <span>{{ player().env }}</span>
                            }
                            @if (player().license) {
                                <span>{{ player().license }}</span>
                            }
                        </span>
                    }
                    @if (metrics(); as m) {
                        <span class="player-card__metrics"
                            >{{ m.cpuPercent.toFixed(1) }}% CPU · {{ m.memoryMB.toFixed(0) }} MB</span
                        >
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

    public readonly remove = output<string>();
    public readonly toggleFocus = output<string>();
    public readonly toggleSelect = output<string>();
    public readonly navigate = output<{ id: string; url: string }>();
    public readonly goBack = output<string>();
    public readonly goForward = output<string>();
    public readonly reload = output<string>();
    public readonly stop = output<string>();
    public readonly toggleMute = output<string>();
    public readonly openDevTools = output<string>();
    public readonly rename = output<{ id: string; label: string }>();

    public readonly body = viewChild.required<ElementRef<HTMLDivElement>>('body');

    public readonly renaming = signal(false);
    public readonly urlDraft = signal('');
    public readonly urlFocused = signal(false);

    public constructor() {
        // Keep the URL bar's draft synced to the live (post-navigation) url,
        // but never clobber what the user is actively typing.
        effect(() => {
            const url = this.player().url;
            if (!this.urlFocused()) this.urlDraft.set(url);
        });
    }

    public onLabelDblClick(event: MouseEvent): void {
        event.stopPropagation(); // don't also toggle focus - see the checkbox's own guard for the same reason
        this.renaming.set(true);
    }

    public commitRename(value: string): void {
        this.renaming.set(false);
        this.rename.emit({ id: this.player().id, label: value.trim() });
    }

    public onUrlBlur(): void {
        this.urlFocused.set(false);
        this.urlDraft.set(this.player().url); // discard an unsubmitted edit
    }

    public commitUrl(value: string): void {
        this.navigate.emit({ id: this.player().id, url: value });
    }
}
