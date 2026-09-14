import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IPC, type ShowToolbarMenuRequest, type ToolbarMenuActionEvent } from '@shared/types';

/**
 * Builds the native Menu template for one of the toolbar's dropdowns -
 * mirrors what app.component.ts's old ntv-popover markup used to render, item
 * for item, but as a real Electron Menu instead of HTML (see
 * ShowToolbarMenuRequest's own comment for why: a WebContentsView always
 * stacks above the renderer's DOM, so an HTML popover can never draw over a
 * player). Every item just posts {kind, action} back to the renderer rather
 * than performing the action here - the renderer already owns all of this
 * logic (removeSelected(), toggleGpu(), etc.) and stays the single source of
 * truth for it.
 */
/** Per-page presets - Columns stays a plain number input in the toolbar (no fixed preset list makes sense there), so this is the only radio-style option list left. */
const PAGE_SIZE_OPTIONS: Array<{ label: string; value: number | null }> = [
    { label: 'Auto (all)', value: null },
    { label: '1 / page', value: 1 },
    { label: '2 / page', value: 2 },
    { label: '4 / page', value: 4 },
    { label: '6 / page', value: 6 },
    { label: '9 / page', value: 9 },
    { label: '12 / page', value: 12 },
    { label: '20 / page', value: 20 },
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
    const emit = (action: string, value?: number | null): void =>
        win.webContents.send(IPC.toolbarMenuAction, { kind, action, value } satisfies ToolbarMenuActionEvent);

    switch (kind) {
        case 'actions':
            return [
                { label: '⟳ Reload all players', click: () => emit('reloadAll') },
                {
                    label: context.allMuted ? '🔊 Unmute all players' : '🔇 Mute all players',
                    click: () => emit('toggleMuteAll'),
                },
            ];

        case 'remove': {
            const items: MenuItemConstructorOptions[] = [];
            if (context.selectedCount) {
                items.push(
                    { label: `Remove selected (${context.selectedCount})`, click: () => emit('removeSelected') },
                    { type: 'separator' },
                );
            }
            items.push({ label: 'Remove all players', click: () => emit('removeAll') });
            return items;
        }

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
                    label: `Docker repository: ${context.dockerRepoLabel ?? 'Set folder…'}`,
                    click: () => emit('chooseDockerRepoPath'),
                },
            ];

        case 'perPage':
            return [
                ...radioItems(PAGE_SIZE_OPTIONS, context.pageSize, (value) => emit('setPageSize', value)),
                { type: 'separator' },
                { label: 'Custom…', click: () => emit('customPageSize') },
            ];
    }
}

export function showToolbarMenu(win: BrowserWindow, request: ShowToolbarMenuRequest): void {
    Menu.buildFromTemplate(buildTemplate(win, request)).popup({
        window: win,
        x: Math.round(request.x),
        y: Math.round(request.y),
    });
}
