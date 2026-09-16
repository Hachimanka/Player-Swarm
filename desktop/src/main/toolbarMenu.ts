import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IPC, type ShowToolbarMenuRequest, type ToolbarMenuActionEvent } from '@shared/types';

/**
 * Builds native Menu templates for the toolbar's dropdowns
 * (Actions/Remove/Layout/Settings). The compact player menu lives in a
 * separate Electron window in playerContextMenu.ts. Both approaches avoid DOM overlays (see
 * ShowToolbarMenuRequest's own comment for why: a WebContentsView always
 * stacks above the renderer's DOM, so an HTML popover can never draw over a
 * player). Every item just posts {kind, action, ...} back to the renderer
 * rather than performing the action here - the renderer already owns all of
 * this logic (removeSelected(), toggleGpu(), onReloadPlayer(), etc.) and
 * stays the single source of truth for it.
 *
 * Organising principle, applied to every kind below: destructive items go
 * last behind a separator, state toggles use real checkbox/radio item types
 * instead of a label that flips wording, and no action appears in two menus -
 * the card menu carries the per-player controls its compact header had to
 * drop, and nothing else.
 */

/** Per-page presets for the Layout menu's "Per page" submenu. */
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
 * Column presets for the Layout menu's "Columns" submenu - replaces the
 * toolbar's old free-text number input. "Auto" is the aspect-ratio-aware
 * layout GridComponent computes from the grid's own measured size; "Custom..."
 * still reaches a real text field, via the same inline-toolbar-input trick
 * Per page's own Custom... uses (a native menu item can't host one).
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

function radioItems(
    options: Array<{ label: string; value: number | null }>,
    current: number | null | undefined,
    onSelect: (value: number | null) => void,
): MenuItemConstructorOptions[] {
    return options.map((opt) => ({
        label: opt.label,
        type: 'radio',
        checked: (current ?? null) === opt.value,
        click: () => onSelect(opt.value),
    }));
}

function buildTemplate(win: BrowserWindow, request: ShowToolbarMenuRequest): MenuItemConstructorOptions[] {
    const { kind, context } = request;
    const emit = (action: string, value?: number | null, playerId?: string): void =>
        win.webContents.send(IPC.toolbarMenuAction, {
            kind,
            action,
            value,
            playerId,
        } satisfies ToolbarMenuActionEvent);

    switch (kind) {
        case 'actions': {
            const total = context.totalCount ?? 0;
            const selected = context.selectedCount ?? 0;
            return [
                { label: 'Reload all players', click: () => emit('reloadAll') },
                {
                    label: 'Mute all players',
                    type: 'checkbox',
                    checked: Boolean(context.allMuted),
                    click: () => emit('toggleMuteAll'),
                },
                { type: 'separator' },
                {
                    label: `Select all (${total})`,
                    enabled: total > 0 && selected < total,
                    click: () => emit('selectAll'),
                },
                { label: 'Clear selection', enabled: selected > 0, click: () => emit('clearSelection') },
            ];
        }

        case 'remove': {
            const selected = context.selectedCount ?? 0;
            return [
                {
                    label: `Remove selected (${selected})`,
                    enabled: selected > 0,
                    click: () => emit('removeSelected'),
                },
                { type: 'separator' },
                { label: `Remove all players (${context.totalCount ?? 0})`, click: () => emit('removeAll') },
            ];
        }

        case 'layout':
            return [
                {
                    label: 'Columns',
                    submenu: [
                        ...radioItems(COLUMN_OPTIONS, context.columns, (value) => emit('setColumns', value)),
                        { type: 'separator' },
                        { label: 'Custom...', click: () => emit('customColumns') },
                    ],
                },
                {
                    label: 'Per page',
                    submenu: [
                        ...radioItems(PAGE_SIZE_OPTIONS, context.pageSize, (value) => emit('setPageSize', value)),
                        { type: 'separator' },
                        { label: 'Custom...', click: () => emit('customPageSize') },
                    ],
                },
            ];

        case 'settings':
            return [
                {
                    label: 'GPU acceleration',
                    type: 'checkbox',
                    checked: !context.gpuDisabled,
                    click: () => emit('toggleGpu'),
                },
                { type: 'separator' },
                {
                    label: `Docker repository: ${context.dockerRepoLabel ?? 'Set folder...'}`,
                    click: () => emit('chooseDockerRepoPath'),
                },
            ];

        // Player menus use the compact child window in playerContextMenu.ts.
        case 'player': return [];
    }
}

export function showToolbarMenu(win: BrowserWindow, request: ShowToolbarMenuRequest): void {
    Menu.buildFromTemplate(buildTemplate(win, request)).popup({
        window: win,
        x: Math.round(request.x),
        y: Math.round(request.y),
    });
}
