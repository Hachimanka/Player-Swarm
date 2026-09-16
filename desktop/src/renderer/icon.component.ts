import { Component, computed, input } from '@angular/core';

/**
 * The app's whole icon set, as stroke paths on a shared 24x24 grid.
 *
 * Replaces the emoji glyphs the toolbar and card headers used to render
 * (writing-system emoji pick up the OS colour font, so they came out
 * multi-coloured and differently sized on every platform - the single
 * biggest reason the UI read as "basic"). One `currentColor` stroke path
 * instead means every icon inherits its button's own colour and hover state
 * and scales with `font-size`, which is what makes the compact card headers
 * possible: the same icon renders at 16px in a grid thumbnail and 18px in an
 * expanded player with no separate assets.
 *
 * Multi-subpath `d` strings are deliberate - one <path> per icon keeps this
 * a flat lookup rather than a per-icon template.
 */
const ICONS = {
    back: 'M15 18l-6-6 6-6',
    forward: 'M9 18l6-6-6-6',
    up: 'M18 15l-6-6-6 6',
    down: 'M6 9l6 6 6-6',
    reload: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.64A9 9 0 0 0 20.49 15',
    stop: 'M6 6h12v12H6z',
    close: 'M18 6L6 18M6 6l12 12',
    volumeOn: 'M11 5L6 9H2v6h4l5 4V5z M15.54 8.46a5 5 0 0 1 0 7.07 M19.07 4.93a10 10 0 0 1 0 14.14',
    volumeOff: 'M11 5L6 9H2v6h4l5 4V5z M23 9l-6 6 M17 9l6 6',
    expand: 'M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7',
    collapse: 'M4 14h6v6 M20 10h-6V4 M14 10l7-7 M3 21l7-7',
    more: 'M12 3.9a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M12 16.1a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    terminal: 'M4 17l6-6-6-6 M12 19h8',
    trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    plus: 'M12 5v14 M5 12h14',
    settings: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
    layout: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
    bolt: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    monitor: 'M2 3h20v14H2z M8 21h8 M12 17v4',
    alert: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
} as const;

export type IconName = keyof typeof ICONS;

/**
 * Icons drawn as filled shapes rather than strokes. Only the overflow dots
 * so far: as three zero-length round-cap strokes they rendered under a pixel
 * wide once scaled into a compact card's 18px button and all but disappeared,
 * so they are real circles instead.
 */
const FILLED_ICONS = new Set<IconName>(['more']);

@Component({
    selector: 'ui-icon',
    template: `
        <svg
            viewBox="0 0 24 24"
            [attr.fill]="filled() ? 'currentColor' : 'none'"
            [attr.stroke]="filled() ? 'none' : 'currentColor'"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false">
            <path [attr.d]="path()" />
        </svg>
    `,
})
export class IconComponent {
    public readonly name = input.required<IconName>();
    public readonly path = computed(() => ICONS[this.name()]);
    public readonly filled = computed(() => FILLED_ICONS.has(this.name()));
}
