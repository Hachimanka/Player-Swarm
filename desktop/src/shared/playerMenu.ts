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
    checked?: boolean;
    separatorBefore?: boolean;
    destructive?: boolean;
}

export interface PlayerMenuData {
    token: number;
    name: string;
    url: string;
    items: PlayerMenuItem[];
}

/** Only this popup can use these operations; no arbitrary IPC or player ID input. */
export interface PlayerMenuAPI {
    initial(): Promise<PlayerMenuData | null>;
    ready(token: number): void;
    choose(token: number, action: string): void;
    dismiss(token: number): void;
    onUpdate(callback: (data: PlayerMenuData) => void): () => void;
}
