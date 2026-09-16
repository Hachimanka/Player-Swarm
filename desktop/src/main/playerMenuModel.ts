import type { PlayerMenuContext, ShowToolbarMenuRequest } from '../shared/types';
import type { MenuRectangle, PlayerMenuItem } from '../shared/playerMenu';

export const PLAYER_MENU_WIDTH = 200;
// 10 action rows (20), context row (18), 3 separators (3), padding (4), border (2).
export const PLAYER_MENU_HEIGHT = 233;

export function playerMenuItems(player: PlayerMenuContext): PlayerMenuItem[] {
    return [
        { action: 'toggleFocus', label: player.focused ? 'Restore to grid' : 'Expand', enabled: true },
        { action: 'toggleSelect', label: 'Selected', enabled: true, checked: player.selected },
        { action: 'goBack', label: 'Back', enabled: player.canGoBack, separatorBefore: true },
        { action: 'goForward', label: 'Forward', enabled: player.canGoForward },
        { action: player.loading ? 'stop' : 'reload', label: player.loading ? 'Stop loading' : 'Reload', enabled: true },
        { action: 'toggleMute', label: 'Muted', enabled: true, checked: player.muted, separatorBefore: true },
        { action: 'rename', label: 'Rename…', enabled: true },
        { action: 'openDevTools', label: 'Open DevTools', enabled: true },
        { action: 'openInstanceConsole', label: 'Open Instance Console', enabled: player.hasInstance },
        { action: 'remove', label: player.hasInstance ? 'Remove player or instance…' : 'Remove player…', enabled: true,
            separatorBefore: true, destructive: true },
    ];
}

export function screenAnchor(request: Pick<ShowToolbarMenuRequest, 'x' | 'y' | 'anchor'>, content: MenuRectangle, zoom: number): MenuRectangle {
    const anchor = request.anchor || { x: request.x, y: request.y, width: 0, height: 0 };
    if (![anchor.x, anchor.y, anchor.width, anchor.height, zoom].every(Number.isFinite) ||
        anchor.width < 0 || anchor.height < 0 || zoom <= 0) throw new Error('Invalid menu anchor');
    // Electron window/screen bounds already use DIPs. Do not multiply by monitor scaleFactor.
    return { x: Math.round(content.x + anchor.x * zoom), y: Math.round(content.y + anchor.y * zoom),
        width: Math.round(anchor.width * zoom), height: Math.round(anchor.height * zoom) };
}

export function playerMenuBounds(anchor: MenuRectangle, workArea: MenuRectangle): MenuRectangle {
    const margin = 4;
    const width = Math.min(PLAYER_MENU_WIDTH, Math.max(1, workArea.width - margin * 2));
    const height = Math.min(PLAYER_MENU_HEIGHT, Math.max(1, workArea.height - margin * 2));
    const gap = anchor.height > 0 ? 2 : 0;
    let x = anchor.x;
    let y = anchor.y + anchor.height + gap;
    if (x + width > workArea.x + workArea.width - margin) x = anchor.x + anchor.width - width;
    if (y + height > workArea.y + workArea.height - margin) y = anchor.y - height - gap;
    x = Math.max(workArea.x + margin, Math.min(x, workArea.x + workArea.width - margin - width));
    y = Math.max(workArea.y + margin, Math.min(y, workArea.y + workArea.height - margin - height));
    return { x: Math.round(x), y: Math.round(y), width, height };
}
