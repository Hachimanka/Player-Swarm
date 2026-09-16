import type { ToolbarMenuContext, ToolbarMenuKind } from '../shared/types';
import type { PlayerMenuItem } from '../shared/playerMenu';

/**
 * Items for the toolbar's dropdowns (Actions/Remove/Layout/Settings). They
 * render in the same compact popup window as the player menu
 * (playerContextMenu.ts), which draws above the WebContentsViews without
 * hiding them. Every item just posts {kind, action, value} back to the
 * renderer rather than performing the action here - the renderer already owns
 * all of this logic (removeSelected(), toggleGpu(), etc.) and stays the single
 * source of truth for it.
 *
 * Organising principle, applied to every kind below: destructive items go
 * last behind a separator, state toggles use checkmarks instead of a label
 * that flips wording, and no action appears in two menus. The popup has no
 * submenus, so Layout's Columns and Per page are labelled sections instead.
 */

/** Per-page presets for the Layout menu's Per page section. */
const PAGE_SIZE_OPTIONS: Array<{ label: string; value: number | null }> = [
    { label: 'Auto (all on one page)', value: null },
    { label: '1 per page', value: 1 },
    { label: '2 per page', value: 2 },
    { label: '4 per page', value: 4 },
    { label: '6 per page', value: 6 },
    { label: '9 per page', value: 9 },
    { label: '12 per page', value: 12 },
    { label: '20 per page', value: 20 },
];

/**
 * Column presets for the Layout menu's Columns section. "Auto" is the
 * aspect-ratio-aware layout GridComponent computes from the grid's own
 * measured size; "Custom…" reaches a real text field in the toolbar, since a
 * menu item can't host one.
 */
const COLUMN_OPTIONS: Array<{ label: string; value: number | null }> = [
    { label: 'Auto (fit to window)', value: null },
    { label: '1 column', value: 1 },
    { label: '2 columns', value: 2 },
    { label: '3 columns', value: 3 },
    { label: '4 columns', value: 4 },
    { label: '5 columns', value: 5 },
    { label: '6 columns', value: 6 },
    { label: '8 columns', value: 8 },
];

function radioItems(action: string, options: Array<{ label: string; value: number | null }>, current: number | null | undefined): PlayerMenuItem[] {
    return options.map((opt) => ({ action, label: opt.label, value: opt.value, radio: true, enabled: true,
        checked: (current ?? null) === opt.value }));
}

export function toolbarMenuItems(kind: Exclude<ToolbarMenuKind, 'player'>, context: ToolbarMenuContext): PlayerMenuItem[] {
    switch (kind) {
        case 'actions': {
            const total = context.totalCount ?? 0;
            const selected = context.selectedCount ?? 0;
            return [
                { action: 'reloadAll', label: 'Reload all players', enabled: true },
                { action: 'toggleMuteAll', label: 'Mute all players', enabled: true, checked: Boolean(context.allMuted) },
                { action: 'selectAll', label: `Select all (${total})`, enabled: total > 0 && selected < total, separatorBefore: true },
                { action: 'clearSelection', label: 'Clear selection', enabled: selected > 0 },
            ];
        }

        case 'remove':
            return [
                { action: 'removeSelected', label: `Remove selected (${context.selectedCount ?? 0})`,
                    enabled: (context.selectedCount ?? 0) > 0, destructive: true },
                { action: 'removeAll', label: `Remove all players (${context.totalCount ?? 0})`, enabled: true,
                    destructive: true, separatorBefore: true },
            ];

        case 'layout':
            return [
                { action: 'heading:columns', label: 'Columns', enabled: false, heading: true },
                ...radioItems('setColumns', COLUMN_OPTIONS, context.columns),
                { action: 'customColumns', label: 'Custom…', enabled: true },
                { action: 'heading:pageSize', label: 'Per page', enabled: false, heading: true, separatorBefore: true },
                ...radioItems('setPageSize', PAGE_SIZE_OPTIONS, context.pageSize),
                { action: 'customPageSize', label: 'Custom…', enabled: true },
            ];

        case 'settings':
            return [
                { action: 'toggleGpu', label: 'GPU acceleration', enabled: true, checked: !context.gpuDisabled },
                { action: 'chooseDockerRepoPath', label: `Docker repository: ${context.dockerRepoLabel ?? 'Set folder…'}`,
                    enabled: true, separatorBefore: true },
            ];
    }
}
