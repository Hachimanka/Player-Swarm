import { menuItemKey, type PlayerMenuAPI, type PlayerMenuData } from '../shared/playerMenu';

declare global { interface Window { playerMenu: PlayerMenuAPI } }

const menu = document.querySelector<HTMLDivElement>('#player-menu')!;
let current: PlayerMenuData | null = null;

const MENU_LABELS: Record<string, string> = { actions: 'Actions', remove: 'Remove', layout: 'Layout', settings: 'Settings' };

function compactUrl(url: string): string {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search ? '?…' : ''}${parsed.hash ? '#…' : ''}`;
        }
    } catch { /* Display unusual URLs as text; never interpret them as HTML. */ }
    return url;
}

function button(label: string, action: string, enabled: boolean, mark = '') {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'popup-item';
    element.dataset.action = action;
    element.setAttribute('role', 'menuitem');
    element.tabIndex = -1;
    element.disabled = !enabled;
    const icon = document.createElement('span');
    icon.className = 'popup-item__mark'; icon.textContent = mark; icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'popup-item__text'; text.textContent = label;
    element.append(icon, text);
    element.addEventListener('click', () => { if (current) window.playerMenu.choose(current.token, action); });
    return element;
}

function render(data: PlayerMenuData) {
    current = data;
    menu.replaceChildren();
    menu.style.width = `min(100vw, ${data.width}px)`;
    menu.style.height = `min(100vh, ${data.height}px)`;
    if (data.kind === 'player') {
        menu.setAttribute('aria-label', `Actions for ${data.name}`);
        const header = button(data.url ? compactUrl(data.url) : data.name || 'Player', 'copy-url', Boolean(data.url), data.url ? '⧉' : '');
        header.classList.add('popup-item--context');
        header.title = data.url ? `${data.name}\n${data.url}\nClick to copy the full URL` : data.name;
        header.setAttribute('aria-label', data.url ? `Copy player URL: ${data.url}` : data.name);
        menu.append(header);
    } else {
        menu.setAttribute('aria-label', MENU_LABELS[data.kind] ?? 'Menu');
    }
    for (const item of data.items) {
        if (item.separatorBefore) {
            const separator = document.createElement('div');
            separator.className = 'popup-separator'; separator.setAttribute('role', 'separator');
            menu.append(separator);
        }
        if (item.heading) {
            const heading = document.createElement('div');
            heading.className = 'popup-heading'; heading.setAttribute('role', 'presentation'); heading.textContent = item.label;
            menu.append(heading);
            continue;
        }
        const element = button(item.label, menuItemKey(item), item.enabled, item.checked ? (item.radio ? '●' : '✓') : '');
        if (item.checked !== undefined) {
            element.setAttribute('role', item.radio ? 'menuitemradio' : 'menuitemcheckbox');
            element.setAttribute('aria-checked', String(item.checked));
        }
        if (item.destructive) element.classList.add('popup-item--danger');
        menu.append(element);
    }
    // Long labels (e.g. a Docker repository folder) are ellipsized; keep the full text in a tooltip.
    for (const text of menu.querySelectorAll<HTMLElement>('.popup-item__text')) {
        if (text.scrollWidth > text.clientWidth && !text.parentElement!.title) text.parentElement!.title = text.textContent ?? '';
    }
    menu.scrollTop = 0;
    menu.focus();
    window.playerMenu.ready(data.token);
}

const enabledItems = () => Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
document.addEventListener('keydown', (event) => {
    if (!current) return;
    const items = enabledItems();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    let target: number | undefined;
    switch (event.key) {
        case 'Escape': case 'Tab':
            event.preventDefault(); window.playerMenu.dismiss(current.token); return;
        case 'ArrowDown': target = (index + 1) % items.length; break;
        case 'ArrowUp': target = index <= 0 ? items.length - 1 : index - 1; break;
        case 'Home': target = 0; break;
        case 'End': target = items.length - 1; break;
        default:
            if (event.key.length === 1 && !event.ctrlKey && !event.altKey && event.key !== ' ') {
                const offset = items.findIndex((_item, n) => items[(index + 1 + n) % items.length]?.querySelector('.popup-item__text')?.textContent?.toLowerCase().startsWith(event.key.toLowerCase()));
                if (offset >= 0) target = (index + 1 + offset) % items.length;
            }
    }
    if (target !== undefined) { event.preventDefault(); items[target]?.focus(); items[target]?.scrollIntoView({ block: 'nearest' }); }
});
document.addEventListener('contextmenu', (event) => event.preventDefault());
window.playerMenu.onUpdate(render);
void window.playerMenu.initial().then((data) => { if (data && (!current || data.token > current.token)) render(data); });
