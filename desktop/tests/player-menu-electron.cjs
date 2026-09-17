const { _electron } = require('playwright-core');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const data = mkdtempSync(join(tmpdir(), 'swarm-menu-qa-'));
let app;
const waitFor = async (fn) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) { if (await fn()) return; await new Promise((resolve) => setTimeout(resolve, 50)); }
    throw new Error('Timed out waiting for player menu');
};
async function run() {
    const env = { ...process.env, MENU_QA_DATA: data }; delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ executablePath: require('electron'), args: [resolve(__dirname, 'player-menu-electron-fixture.cjs')], env });
    app.process().stderr.on('data', (chunk) => process.stderr.write(chunk));
    await waitFor(() => app.evaluate(() => Boolean(global.menuQA)));
    const shell = app.windows().find((p) => p.url().includes('QA%20menu') || p.url().includes('QA menu')) || await app.firstWindow();
    // Let Windows finish applying the fixture's initial non-client bounds before checking anchors.
    await shell.waitForTimeout(250);
    await shell.evaluate(() => { window.qaActions = []; window.playerSwarm.onToolbarMenuAction((event) => window.qaActions.push(event)); });
    const player = { id: 'qa-player', name: 'A very long player label '.repeat(30),
        url: 'http://localhost:8095/play?operationHours=true&programmatic=true&long=' + 'x'.repeat(1000),
        selected: true, muted: true, loading: false, focused: false, canGoBack: false, canGoForward: true, hasInstance: true };
    let popup;
    const visible = () => app.evaluate(() => global.menuQA.shell.getChildWindows().some((w) => w.isVisible()));
    const open = async (patch = {}, position = {}) => {
        await app.evaluate(() => global.menuQA.shell.focus());
        await shell.evaluate((request) => window.playerSwarm.showToolbarMenu(request), {
            kind: 'player', x: 300, y: 120, ...position, context: { player: { ...player, ...patch } },
        });
        await waitFor(visible);
        popup = app.windows().find((p) => p.url().endsWith('/player-menu.html'));
        assert.ok(popup);
    };
    const before = await app.evaluate(() => global.menuQA.view.getBounds());
    await open();
    const dimensions = await popup.evaluate(() => ({ width: document.querySelector('#player-menu').getBoundingClientRect().width, height: innerHeight,
        scroll: document.querySelector('#player-menu').scrollHeight, client: document.querySelector('#player-menu').clientHeight,
        row: document.querySelector('[data-action=toggleFocus]').getBoundingClientRect().height }));
    assert.equal(dimensions.width, 168); assert.equal(dimensions.height, 220); assert.equal(dimensions.row, 18);
    assert.equal(dimensions.scroll, dimensions.client);
    assert.equal(await popup.getByRole('menuitemcheckbox', { name: 'Selected' }).getAttribute('aria-checked'), 'true');
    assert.equal(await popup.getByRole('menuitem', { name: 'Back', exact: true }).isDisabled(), true);
    const bounds = await app.evaluate(() => ({ menu: global.menuQA.shell.getChildWindows()[0].getBounds(), shell: global.menuQA.shell.getContentBounds() }));
    assert.equal(bounds.menu.x, bounds.shell.x + 300); assert.equal(bounds.menu.y, bounds.shell.y + 120);
    mkdirSync(resolve(__dirname, '../release'), { recursive: true });
    await popup.screenshot({ path: resolve(__dirname, '../release/player-menu-qa.png') });
    await popup.getByRole('menuitem', { name: /^Copy player URL/ }).click();
    await waitFor(async () => !(await visible()));
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), player.url);
    console.log('PASS compact dimensions, long text, selected/disabled states, right-click positioning and full URL copy');

    for (const action of ['toggleFocus', 'toggleSelect', 'goForward', 'reload', 'toggleMute', 'rename', 'openDevTools', 'openInstanceConsole', 'remove']) {
        await open();
        await popup.locator(`[data-action="${action}"]`).click();
        await waitFor(async () => !(await visible()));
        await waitFor(async () => (await shell.evaluate(() => window.qaActions.at(-1)?.action)) === action);
        const selected = await shell.evaluate(() => window.qaActions.at(-1));
        assert.deepEqual(selected, { kind: 'player', playerId: 'qa-player', action });
    }
    await open({ loading: true, focused: true, muted: false, selected: false, hasInstance: false, canGoBack: true });
    assert.equal(await popup.locator('[data-action=openInstanceConsole]').isDisabled(), true);
    assert.equal(await popup.locator('[data-action=toggleFocus]').innerText(), 'Restore to grid');
    await popup.locator('[data-action=stop]').click();
    await waitFor(async () => !(await visible()));
    await waitFor(async () => (await shell.evaluate(() => window.qaActions.at(-1)?.action)) === 'stop');
    assert.equal(await shell.evaluate(() => window.qaActions.at(-1).action), 'stop');
    console.log('PASS existing action dispatch, loading/focused states and disabled Instance Console');

    await open({}, { anchor: { x: 50, y: 30, width: 24, height: 26 } });
    const anchored = await app.evaluate(() => ({ menu: global.menuQA.shell.getChildWindows()[0].getBounds(), shell: global.menuQA.shell.getContentBounds() }));
    assert.equal(anchored.menu.x, anchored.shell.x + 50); assert.equal(anchored.menu.y, anchored.shell.y + 58);
    await popup.keyboard.press('End');
    assert.equal(await popup.evaluate(() => document.activeElement.dataset.action), 'remove');
    await popup.keyboard.press('Home');
    await popup.keyboard.press('ArrowDown');
    assert.equal(await popup.evaluate(() => document.activeElement.dataset.action), 'toggleFocus');
    await popup.keyboard.press('Escape'); await waitFor(async () => !(await visible()));
    await open();
    await app.evaluate(() => { const [x, y] = global.menuQA.shell.getPosition(); global.menuQA.shell.setPosition(x + 20, y + 20); });
    await waitFor(async () => !(await visible()));
    await open();
    await app.evaluate(() => global.menuQA.shell.setSize(950, 680));
    await waitFor(async () => !(await visible()));
    await open();
    await app.evaluate(() => { global.menuQA.shell.focus(); global.menuQA.view.webContents.focus(); });
    await waitFor(async () => !(await visible()));
    console.log('PASS button anchoring, keyboard navigation, Escape, movement, resize and outside focus dismissal');

    const toolbar = async (kind, context, anchor = { x: 600, y: 10, width: 80, height: 28 }) => {
        await app.evaluate(() => global.menuQA.shell.focus());
        await shell.evaluate((request) => window.playerSwarm.showToolbarMenu(request), { kind, x: anchor.x, y: anchor.y + anchor.height, anchor, context });
        await waitFor(async () => (await visible()) && (await popup.evaluate((kind) => document.querySelector('#player-menu').getAttribute('aria-label') === kind, kind[0].toUpperCase() + kind.slice(1))));
    };
    const pick = async (key, page = popup) => {
        const before = await shell.evaluate(() => window.qaActions.length);
        await page.locator(`[data-action="${key}"]`).click();
        await waitFor(async () => !(await visible()));
        await waitFor(async () => (await shell.evaluate(() => window.qaActions.length)) > before);
        return shell.evaluate(() => window.qaActions.at(-1));
    };
    await toolbar('actions', { allMuted: true, totalCount: 3, selectedCount: 0 });
    assert.equal(await popup.locator('[data-action=copy-url]').count(), 0);
    assert.equal(await popup.getByRole('menuitemcheckbox', { name: 'Mute all players' }).getAttribute('aria-checked'), 'true');
    assert.equal(await popup.locator('[data-action=clearSelection]').isDisabled(), true);
    const actionsSize = await popup.evaluate(() => { const r = document.querySelector('#player-menu').getBoundingClientRect(); return [r.width, r.height, document.querySelector('#player-menu').scrollHeight <= document.querySelector('#player-menu').clientHeight]; });
    assert.deepEqual(actionsSize, [184, 8 + 4 * 18 + 5, true]);
    const toolbarBounds = await app.evaluate(() => ({ menu: global.menuQA.shell.getChildWindows()[0].getBounds(), shell: global.menuQA.shell.getContentBounds() }));
    assert.equal(toolbarBounds.menu.x, toolbarBounds.shell.x + 600); assert.equal(toolbarBounds.menu.y, toolbarBounds.shell.y + 40);
    assert.deepEqual(await pick('reloadAll'), { kind: 'actions', action: 'reloadAll' });

    await toolbar('remove', { selectedCount: 2, totalCount: 3 });
    assert.deepEqual(await pick('removeSelected'), { kind: 'remove', action: 'removeSelected' });

    const childCount = () => app.evaluate(() => global.menuQA.shell.getChildWindows().filter((w) => w.isVisible()).length);
    const closeWithKey = async (page, key) => {
        // A submenu is destroyed on keydown, so Playwright may not be able to send keyup to it.
        await page.keyboard.press(key).catch((error) => {
            if (!error.message.includes('Target page, context or browser has been closed')) throw error;
        });
        await waitFor(() => page.isClosed());
    };
    const submenu = async (parent, action, label, keyboard = false) => {
        const item = parent.locator(`[data-action="${action}"]`);
        if (keyboard) { await item.focus(); await parent.keyboard.press('ArrowRight'); }
        else await item.hover();
        let page;
        await waitFor(async () => {
            for (const candidate of app.windows()) {
                if (candidate !== parent && !candidate.isClosed() && candidate.url().endsWith('/player-menu.html') &&
                    await candidate.evaluate((label) => document.querySelector('#player-menu')?.getAttribute('aria-label') === label, label).catch(() => false)) {
                    page = candidate;
                    return candidate.evaluate(async () => Boolean(await window.playerMenu.initial())).catch(() => false);
                }
            }
            return false;
        });
        await waitFor(async () => (await item.getAttribute('aria-expanded')) === 'true');
        const parentDepth = await parent.evaluate(async () => (await window.playerMenu.initial()).depth);
        await waitFor(async () => (await childCount()) === parentDepth + 2);
        return page;
    };
    await toolbar('layout', { columns: 3, pageSize: null });
    assert.equal(await popup.locator('button').count(), 1);
    // Windows can enforce a larger transparent native window minimum; the painted menu stays one row.
    assert.deepEqual(await popup.evaluate(() => { const r = document.querySelector('#player-menu').getBoundingClientRect(); return [r.width, r.height]; }), [132, 26]);
    let categories = await submenu(popup, 'layout', 'Layout');
    assert.deepEqual(await categories.locator('.popup-item__text').allInnerTexts(), ['Columns', 'Per page']);
    let values = await submenu(categories, 'columns', 'Columns');
    await waitFor(async () => (await childCount()) === 3);
    assert.equal(await values.locator('[data-action="setColumns:3"]').getAttribute('aria-checked'), 'true');
    assert.deepEqual(await values.locator('.popup-item__text').allInnerTexts(), ['Auto', '1', '2', '3', '4', '5', '6', '8', 'Custom…']);
    await popup.screenshot({ path: resolve(__dirname, '../release/toolbar-layout-menu-qa.png') });
    await categories.screenshot({ path: resolve(__dirname, '../release/toolbar-layout-categories-qa.png') });
    await values.screenshot({ path: resolve(__dirname, '../release/toolbar-layout-values-qa.png') });
    const columnsToken = await values.evaluate(async () => (await window.playerMenu.initial()).token);
    values = await submenu(categories, 'pageSize', 'Per page');
    await waitFor(async () => (await childCount()) === 3);
    assert.equal(await values.locator('[data-action="setPageSize:auto"]').getAttribute('aria-checked'), 'true');
    assert.equal(await categories.locator('[data-action=columns]').getAttribute('aria-expanded'), 'false');
    assert.equal(await values.evaluate(() => { const m = document.querySelector('#player-menu'); return m.scrollHeight <= m.clientHeight; }), true);
    const rejectedLayout = await shell.evaluate(() => window.qaActions.length);
    await popup.evaluate(async () => window.playerMenu.choose((await window.playerMenu.initial()).token, 'setPageSize:12'));
    await values.evaluate(() => window.playerMenu.choose(undefined, 'setPageSize:12'));
    await values.evaluate((token) => window.playerMenu.choose(token, 'setPageSize:12'), columnsToken);
    assert.equal(await shell.evaluate(() => window.qaActions.length), rejectedLayout);
    assert.deepEqual(await pick('setPageSize:12', values), { kind: 'layout', action: 'setPageSize', value: 12 });

    // Keyboard enters each level, returns to its owner, and dispatches Custom unchanged.
    const keyboardCategories = () => submenu(popup, 'layout', 'Layout', true);
    await toolbar('layout', { columns: null, pageSize: 12 });
    categories = await keyboardCategories();
    values = await submenu(categories, 'columns', 'Columns', true);
    await closeWithKey(values, 'ArrowLeft');
    await waitFor(async () => (await childCount()) === 2);
    assert.equal(await categories.evaluate(() => document.activeElement.dataset.action), 'columns');
    values = await submenu(categories, 'pageSize', 'Per page', true);
    await values.keyboard.press('End');
    assert.equal(await values.evaluate(() => document.activeElement.dataset.action), 'customPageSize');
    await closeWithKey(values, 'Enter');
    await waitFor(async () => !(await visible()));
    await waitFor(async () => (await shell.evaluate(() => window.qaActions.at(-1).action)) === 'customPageSize');

    for (const key of ['setColumns:auto', 'customColumns']) {
        await toolbar('layout', { columns: 7, pageSize: 15 });
        categories = await keyboardCategories();
        values = await submenu(categories, 'columns', 'Columns', true);
        assert.equal(await values.locator('[data-action=customColumns]').getAttribute('aria-checked'), 'true');
        assert.deepEqual(await pick(key, values), key === 'customColumns'
            ? { kind: 'layout', action: 'customColumns' } : { kind: 'layout', action: 'setColumns', value: null });
    }
    await toolbar('layout', { columns: 3, pageSize: null });
    categories = await keyboardCategories();
    values = await submenu(categories, 'columns', 'Columns', true);
    await closeWithKey(values, 'Escape');
    await waitFor(async () => !(await visible()));
    assert.equal(await app.evaluate(() => global.menuQA.shell.getChildWindows().length), 1);
    // Native focus and lifecycle dismissals close descendants as well as the reusable root.
    for (const reason of ['resize', 'outside']) {
        await toolbar('layout', { columns: 3, pageSize: null });
        categories = await keyboardCategories();
        values = await submenu(categories, 'columns', 'Columns', true);
        await app.evaluate((reason) => {
            if (reason === 'resize') {
                const [width, height] = global.menuQA.shell.getSize();
                global.menuQA.shell.setSize(width + 10, height);
            } else { global.menuQA.shell.focus(); global.menuQA.view.webContents.focus(); }
        }, reason);
        await waitFor(async () => !(await visible()));
        assert.equal(await app.evaluate(() => global.menuQA.shell.getChildWindows().length), 1);
        // Outside focus retains the existing same-button toggle guard for 300ms.
        await shell.waitForTimeout(320);
    }
    console.log('PASS nested Layout hover, sibling switching, keyboard, selected presets/custom values, scoped tokens and chain cleanup');

    await toolbar('settings', { gpuDisabled: false, dockerRepoLabel: 'a-very-long-docker-repository-folder-name-for-qa' });
    assert.equal(await popup.getByRole('menuitemcheckbox', { name: 'GPU acceleration' }).getAttribute('aria-checked'), 'true');
    assert.equal(await popup.locator('[data-action=chooseDockerRepoPath]').getAttribute('title'), 'Docker repository: a-very-long-docker-repository-folder-name-for-qa');
    await popup.screenshot({ path: resolve(__dirname, '../release/toolbar-settings-menu-qa.png') });
    assert.deepEqual(await pick('toggleGpu'), { kind: 'settings', action: 'toggleGpu' });

    // Clicking the same toolbar button again closes its menu rather than reopening it.
    await toolbar('actions', { totalCount: 3, selectedCount: 0 });
    const count = await shell.evaluate(() => window.qaActions.length);
    await app.evaluate(() => global.menuQA.shell.focus());
    await waitFor(async () => !(await visible()));
    await shell.evaluate((request) => window.playerSwarm.showToolbarMenu(request),
        { kind: 'actions', x: 600, y: 38, anchor: { x: 600, y: 10, width: 80, height: 28 }, context: { totalCount: 3 } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(await visible(), false);
    assert.equal(await shell.evaluate(() => window.qaActions.length), count);
    await toolbar('actions', { totalCount: 3, selectedCount: 0 });
    await popup.keyboard.press('Escape'); await waitFor(async () => !(await visible()));
    const rejected = await shell.evaluate(() => window.qaActions.length);
    await toolbar('remove', { selectedCount: 0, totalCount: 3 });
    await popup.evaluate(async () => window.playerMenu.choose((await window.playerMenu.initial()).token, 'removeSelected'));
    await popup.evaluate(async () => window.playerMenu.choose((await window.playerMenu.initial()).token, 'copy-url'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await shell.evaluate(() => window.qaActions.length), rejected);
    await popup.keyboard.press('Escape'); await waitFor(async () => !(await visible()));
    console.log('PASS toolbar Actions/Remove/Layout/Settings menus: states, values, sizing, anchoring, toggle-close and disabled-item rejection');

    await open();
    const oldToken = await popup.evaluate(async () => (await window.playerMenu.initial()).token);
    await popup.keyboard.press('Escape');
    await open({ url: '', name: 'Player without URL' });
    const previous = await shell.evaluate(() => window.qaActions.length);
    await popup.evaluate((token) => window.playerMenu.choose(token, 'remove'), oldToken);
    await popup.evaluate(async () => window.playerMenu.choose((await window.playerMenu.initial()).token, 'goBack'));
    assert.equal(await shell.evaluate(() => window.qaActions.length), previous);
    assert.equal(await popup.locator('[data-action=copy-url]').isDisabled(), true);
    const unauthorized = await app.evaluate(async ({ ipcMain }) => {
        // Exercise the handler with a real non-popup sender, without widening its preload API.
        const result = await ipcMain._invokeHandlers.get('player-menu:initial')({
            sender: global.menuQA.shell.webContents, senderFrame: global.menuQA.shell.webContents.mainFrame });
        return result;
    });
    assert.equal(unauthorized, null);
    await app.evaluate(() => global.menuQA.remove());
    await waitFor(async () => !(await visible()));
    assert.deepEqual(await app.evaluate(() => global.menuQA.view.getBounds()), before);
    console.log('PASS stale/disabled/foreign requests rejected, missing URL, removal and unchanged WebContentsView bounds');
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
    try {
        if (app) {
            // Close the fixture's separately owned WebContentsView before quitting Electron.
            await app.evaluate(() => { if (!global.menuQA.view.webContents.isDestroyed()) global.menuQA.view.webContents.close(); }).catch(() => {});
            await app.close();
        }
    } finally { rmSync(data, { recursive: true, force: true }); }
});
