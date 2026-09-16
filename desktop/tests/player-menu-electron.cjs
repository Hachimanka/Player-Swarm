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
    const dimensions = await popup.evaluate(() => ({ width: innerWidth, height: innerHeight,
        scroll: document.querySelector('#player-menu').scrollHeight, client: document.querySelector('#player-menu').clientHeight,
        row: document.querySelector('[data-action=toggleFocus]').getBoundingClientRect().height }));
    assert.equal(dimensions.width, 200); assert.equal(dimensions.height, 233); assert.equal(dimensions.row, 20);
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
    try { if (app) await app.close(); } finally { rmSync(data, { recursive: true, force: true }); }
});
