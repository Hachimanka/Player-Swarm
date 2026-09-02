import type { Player } from '@shared/types';

export function createPlayerCard(player: Player, onRemove: (id: string) => void): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.dataset['playerId'] = player.id;

    const header = document.createElement('div');
    header.className = 'player-card__header';

    const label = document.createElement('span');
    label.className = 'player-card__label';
    label.textContent = player.url;
    header.appendChild(label);

    const removeButton = document.createElement('button');
    removeButton.className = 'player-card__remove';
    removeButton.type = 'button';
    removeButton.textContent = '✕';
    removeButton.title = 'Remove player';
    removeButton.addEventListener('click', () => onRemove(player.id));
    header.appendChild(removeButton);

    card.appendChild(header);

    // Left empty on purpose: the actual WebContentsView is layered on top of this
    // element by the main process, matched to its getBoundingClientRect().
    const body = document.createElement('div');
    body.className = 'player-card__body';
    card.appendChild(body);

    return card;
}

export function setPlayerCardLabel(card: HTMLDivElement, player: Player): void {
    const label = card.querySelector<HTMLSpanElement>('.player-card__label');
    if (label) label.textContent = player.url;
}
