import type { ToolbarMenuKind } from './types';

export interface MenuRectangle { x: number; y: number; width: number; height: number }

/** CSS viewport coordinates from the card; main converts them to screen DIPs. */
export interface PlayerMenuTrigger {
    id: string;
    x: number;
    y: number;
    anchor?: MenuRectangle;
}

export interface PlayerMenuItem {
    action: string;
    label: string;
    enabled: boolean;
    /** Checkbox state, or the selected option of a radio group when `radio` is set. */
    checked?: boolean;
    radio?: boolean;
    /** Payload sent with the action, e.g. a column count; null means Auto. */
    value?: number | null;
    /** A non-interactive section label (Layout's Columns/Per page) instead of an action. */
    heading?: boolean;
    separatorBefore?: boolean;
    destructive?: boolean;
}

export interface PlayerMenuData {
    token: number;
    kind: ToolbarMenuKind;
    /** Player menus show a name/URL row above their items; toolbar menus leave both empty and show none. */
    name: string;
    url: string;
    width: number;
    height: number;
    items: PlayerMenuItem[];
}

/** The key the popup reports for an item - unique within a menu even when one action has several values. */
export function menuItemKey(item: PlayerMenuItem): string {
    return item.value === undefined ? item.action : `${item.action}:${item.value ?? 'auto'}`;
}

/** Only this popup can use these operations; no arbitrary IPC or player ID input. */
export interface PlayerMenuAPI {
    initial(): Promise<PlayerMenuData | null>;
    ready(token: number): void;
    choose(token: number, action: string): void;
    dismiss(token: number): void;
    onUpdate(callback: (data: PlayerMenuData) => void): () => void;
}
