import { Grid } from './grid';

function buildToolbar(
    onAddPlayer: () => void,
    onColumnOverrideChange: (columns: number | null) => void,
): HTMLDivElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'toolbar__add-button';
    addButton.textContent = '+ Add Player';
    addButton.addEventListener('click', onAddPlayer);
    toolbar.appendChild(addButton);

    const columnsLabel = document.createElement('label');
    columnsLabel.className = 'toolbar__columns-label';
    columnsLabel.textContent = 'Columns';

    const columnsInput = document.createElement('input');
    columnsInput.type = 'number';
    columnsInput.min = '0';
    columnsInput.placeholder = 'Auto';
    columnsInput.className = 'toolbar__columns-input';
    columnsInput.addEventListener('change', () => {
        const value = Number.parseInt(columnsInput.value, 10);
        onColumnOverrideChange(Number.isFinite(value) && value > 0 ? value : null);
    });

    columnsLabel.appendChild(columnsInput);
    toolbar.appendChild(columnsLabel);

    return toolbar;
}

function buildAddPlayerModal(onSubmit: (url: string) => void): { element: HTMLDivElement; open: () => void } {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.hidden = true;

    const modal = document.createElement('div');
    modal.className = 'modal';

    const title = document.createElement('h2');
    title.textContent = 'Add Player';
    modal.appendChild(title);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'https://example.com (blank = new tab)';
    input.className = 'modal__url-input';
    modal.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'modal__actions';

    const close = (): void => {
        overlay.hidden = true;
        input.value = '';
        window.playerSwarm.setOverlayVisible(false);
    };

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', close);
    actions.appendChild(cancelButton);

    const submitButton = document.createElement('button');
    submitButton.type = 'button';
    submitButton.textContent = 'Add';
    submitButton.className = 'modal__submit-button';
    const submit = (): void => {
        onSubmit(input.value);
        close();
    };
    submitButton.addEventListener('click', submit);
    actions.appendChild(submitButton);

    modal.appendChild(actions);
    overlay.appendChild(modal);

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') submit();
        if (event.key === 'Escape') close();
    });

    return {
        element: overlay,
        open: () => {
            overlay.hidden = false;
            window.playerSwarm.setOverlayVisible(true);
            input.focus();
        },
    };
}

function main(): void {
    const app = document.getElementById('app');
    if (!app) throw new Error('#app root element not found');

    const gridMount = document.createElement('div');
    gridMount.className = 'grid-mount';

    const grid = new Grid(gridMount, (id) => {
        void window.playerSwarm.removePlayer(id);
    });

    const modal = buildAddPlayerModal((url) => {
        void window.playerSwarm.addPlayer(url);
    });

    const toolbar = buildToolbar(
        () => modal.open(),
        (columns) => grid.setColumnOverride(columns),
    );

    app.appendChild(toolbar);
    app.appendChild(gridMount);
    app.appendChild(modal.element);

    window.playerSwarm.onPlayersChanged((players) => grid.setPlayers(players));
    void window.playerSwarm.listPlayers().then((players) => grid.setPlayers(players));
}

main();
