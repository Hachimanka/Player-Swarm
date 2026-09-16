// Player card header: Instance Console button, DevTools via the ⋮ menu, header fit at every density tier.
// Requires Docker, a local nginx:alpine image and a graphical Electron session. It creates disposable,
// labelled QA containers and temporary settings, and removes only those when done.
const assert = require('node:assert/strict');
const { _electron } = require('playwright-core');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30000 }).trim();
const root = mkdtempSync(join(tmpdir(), 'swarm-header-qa-'));
const containers = [];
let app;
const waitFor = async (fn, timeout = 20000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await fn()) return; await new Promise((resolve) => setTimeout(resolve, 100)); }
    throw new Error('Timed out waiting for header state');
};

async function run() {
    const stamp = Date.now();
    const players = [];
    for (const key of ['a', 'b']) {
        const name = `header-qa-${stamp}-${key}`;
        const directory = join(root, 'instances', name);
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, 'docker-compose.yml'), 'services:\n  player-server:\n    image: nginx:alpine\n');
        containers.push(docker('run', '-d', '--label', `com.docker.compose.project=headless-player-${name}`,
            '--label', 'com.docker.compose.service=player-server', '--label', 'com.docker.compose.oneoff=False',
            'nginx:alpine', 'sh', '-c', `while true; do echo ONLY_HEADER_PLAYER_${key.toUpperCase()}; sleep 1; done`));
        players.push({ id: `qa-${key}`, url: 'about:blank', partition: `persist:player-qa-${key}`, muted: false,
            label: `QA Player ${key.toUpperCase()}`, instanceName: name });
    }
    players.push({ id: 'qa-c', url: 'about:blank', partition: 'persist:player-qa-c', muted: false, label: 'QA URL only' });
    const data = join(root, 'app-data'); mkdirSync(data);
    writeFileSync(join(data, 'settings.json'), JSON.stringify({ dockerRepoPath: root, players }));

    const env = { ...process.env, HEADER_QA_DATA: data }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL;
    app = await _electron.launch({ executablePath: require('electron'), args: [resolve(__dirname, 'player-header-electron-fixture.cjs')], env });
    app.process().stderr.on('data', (chunk) => process.stderr.write(chunk));
    await waitFor(() => app.windows().some((page) => page.url().endsWith('/renderer/index.html')), 30000);
    const shell = app.windows().find((page) => page.url().endsWith('/renderer/index.html'));
    await shell.waitForSelector('[data-player-id="qa-c"] .player-card__header');

    // Record the IPC the shell sends, without changing any handler's behaviour.
    await app.evaluate(({ ipcMain, dialog }) => {
        global.headerQA = { sent: [], opened: [], dialogs: 0 };
        const emit = ipcMain.emit;
        ipcMain.emit = function (channel, ...args) { global.headerQA.sent.push([channel, args[1]]); return emit.call(this, channel, ...args); };
        const handlers = ipcMain._invokeHandlers;
        const open = handlers.get('instance-console:open');
        handlers.set('instance-console:open', (event, id) => { global.headerQA.opened.push(id); return open(event, id); });
        dialog.showMessageBox = async () => { global.headerQA.dialogs++; return { response: 0, checkboxChecked: false }; };
    });
    const card = (id) => shell.locator(`.player-card[data-player-id="${id}"]`);
    const consoleButton = (id) => card(id).locator('button[aria-label="Instance Console"]');
    const consoles = () => app.windows().filter((page) => page.url().endsWith('/console.html'));
    const setSize = (width, height) => app.evaluate(({ BrowserWindow }, [width, height]) => {
        const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/index.html'));
        win.unmaximize(); win.setContentSize(width, height);
    }, [width, height]);

    await setSize(1900, 1000);
    await waitFor(async () => (await card('qa-a').getAttribute('class')).includes('player-card--lg'));
    assert.equal(await card('qa-a').locator('button[title*="DevTools"]').count(), 0);
    assert.equal(await consoleButton('qa-a').getAttribute('title'), 'Instance Console');
    assert.equal(await consoleButton('qa-c').isDisabled(), true);
    assert.equal(await consoleButton('qa-c').getAttribute('title'), 'Instance Console (no Docker instance)');

    await consoleButton('qa-a').click();
    await waitFor(() => consoles().length === 1);
    const consoleA = consoles()[0];
    await consoleButton('qa-b').click();
    await waitFor(() => consoles().length === 2);
    const consoleB = consoles().find((page) => page !== consoleA);
    const consoleTitles = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
        .filter((w) => w.webContents.getURL().endsWith('/console.html')).map((w) => w.getTitle()).sort());
    await waitFor(async () => JSON.stringify(await consoleTitles()) === JSON.stringify(['QA Player A — Instance Console', 'QA Player B — Instance Console']));
    await waitFor(async () => (await consoleA.locator('.console-log').innerText()).includes('ONLY_HEADER_PLAYER_A'));
    await waitFor(async () => (await consoleB.locator('.console-log').innerText()).includes('ONLY_HEADER_PLAYER_B'));
    assert.ok(!(await consoleA.locator('.console-log').innerText()).includes('ONLY_HEADER_PLAYER_B'));
    assert.ok(!(await consoleB.locator('.console-log').innerText()).includes('ONLY_HEADER_PLAYER_A'));
    await consoleButton('qa-a').click(); // Reopening focuses the existing console instead of creating another.
    await waitFor(async () => (await app.evaluate(() => global.headerQA.opened.length)) === 3);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(consoles().length, 2);
    await consoleButton('qa-c').click({ force: true });
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.deepEqual(await app.evaluate(() => global.headerQA.opened), ['qa-a', 'qa-b', 'qa-a']);
    assert.equal(consoles().length, 2);
    await app.evaluate(({ BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows()) if (win.webContents.getURL().endsWith('/console.html')) win.close();
    });
    await waitFor(() => consoles().length === 0);
    console.log('PASS header opens each player\'s own Instance Console, reuses it, and is disabled without an instance');

    await card('qa-b').locator('button[title="More actions"]').click();
    await waitFor(() => app.windows().some((page) => page.url().endsWith('/player-menu.html')));
    const menu = app.windows().find((page) => page.url().endsWith('/player-menu.html'));
    await menu.locator('[data-action="openDevTools"]').waitFor();
    await menu.locator('[data-action="openDevTools"]').click();
    const devtools = () => app.evaluate(({ webContents }) => Object.fromEntries(webContents.getAllWebContents()
        .map((wc) => [wc.session.getStoragePath() || '', wc.isDevToolsOpened()])
        .filter(([path]) => /player-qa-[abc]$/.test(path)).map(([path, open]) => [path.slice(-4), open])));
    await waitFor(async () => (await devtools())['qa-b'] === true);
    assert.deepEqual(await devtools(), { 'qa-a': false, 'qa-b': true, 'qa-c': false });
    assert.ok((await app.evaluate(() => global.headerQA.sent)).some(([channel, id]) => channel === 'player:open-devtools' && id === 'qa-b'));
    await app.evaluate(({ webContents }) => { for (const wc of webContents.getAllWebContents()) if (wc.isDevToolsOpened()) wc.closeDevTools(); });
    console.log('PASS Open DevTools from the ⋮ menu opens the chosen player only');

    const expected = {
        lg: ['Back', 'Forward', 'Reload', 'Unmute|Mute', 'Instance Console', 'Expand', 'Remove player', 'More actions'],
        md: ['Reload', 'Unmute|Mute', 'Instance Console', 'Expand', 'Remove player', 'More actions'],
        sm: ['Reload', 'Expand', 'Remove player', 'More actions'],
        xs: ['Reload', 'Expand', 'More actions'],
    };
    const seen = new Set();
    for (const [width, height] of [[1900, 1000], [1250, 900], [800, 800], [700, 600], [500, 700], [360, 700], [420, 380], [300, 260]]) {
        await setSize(width, height);
        await new Promise((resolve) => setTimeout(resolve, 600));
        const cards = await shell.$$eval('.player-card', (elements) => elements.map((element) => {
            const header = element.querySelector('.player-card__header');
            const actions = element.querySelector('.player-card__actions');
            const buttons = [...element.querySelectorAll('.player-card__header button')];
            const size = (selector) => { const r = element.querySelector(selector)?.getBoundingClientRect(); return r && [r.width, r.height]; };
            return { id: element.dataset.playerId, tier: [...element.classList].find((c) => /^player-card--(lg|md|sm|xs)$/.test(c))?.slice(13),
                visible: element.getBoundingClientRect().width > 0, overflow: header.scrollWidth - header.clientWidth,
                actionsInside: actions.getBoundingClientRect().right <= header.getBoundingClientRect().right + 0.5,
                titles: buttons.map((b) => b.getAttribute('title')),
                consoleSize: size('button[aria-label="Instance Console"]'), expandSize: size('button[title="Expand"], button[title="Restore to grid"]') };
        }));
        for (const c of cards.filter((c) => c.visible)) {
            seen.add(c.tier);
            assert.ok(c.overflow <= 0, `${c.id} header overflows by ${c.overflow}px at ${width}x${height} (${c.tier})`);
            assert.ok(c.actionsInside, `${c.id} actions extend past the header at ${width}x${height}`);
            assert.deepEqual(c.titles.map((t) => t.startsWith('Instance Console') ? 'Instance Console' : /^(Unmute|Mute)$/.test(t) ? 'Unmute|Mute' : t === 'Stop loading' ? 'Reload' : t),
                expected[c.tier], `${c.id} buttons at ${c.tier}`);
            if (c.consoleSize) assert.deepEqual(c.consoleSize, c.expandSize);
        }
        console.log(`  ${width}x${height}: ${cards.filter((c) => c.visible).map((c) => c.tier).join(' ')}`);
        await shell.screenshot({ path: resolve(__dirname, `../release/player-header-qa-${width}x${height}.png`) });
    }
    assert.deepEqual([...seen].sort(), ['lg', 'md', 'sm', 'xs']);
    console.log('PASS header buttons per tier, Instance Console sized like Expand, no header overflow');

    await setSize(1900, 1000);
    await waitFor(async () => (await card('qa-a').getAttribute('class')).includes('player-card--lg'));
    const sentBefore = (await app.evaluate(() => global.headerQA.sent.length));
    await card('qa-a').locator('button[title="Reload"]').click();
    await card('qa-a').locator('button[title="Mute"]').click();
    await waitFor(async () => (await card('qa-a').locator('button[title="Unmute"]').count()) === 1);
    await card('qa-a').locator('button[title="Unmute"]').click();
    await card('qa-a').locator('button[title="Expand"]').click();
    await waitFor(async () => (await card('qa-a').locator('button[title="Restore to grid"]').count()) === 1);
    await card('qa-a').locator('button[title="Restore to grid"]').click();
    await waitFor(async () => (await card('qa-a').locator('button[title="Expand"]').count()) === 1);
    await card('qa-a').locator('button[title="Remove player"]').click();
    await waitFor(async () => (await app.evaluate(() => global.headerQA.dialogs)) === 1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await card('qa-a').count(), 1);
    const sent = (await app.evaluate(() => global.headerQA.sent)).slice(sentBefore);
    for (const channel of ['player:reload', 'player:set-muted']) assert.ok(sent.some(([c, id]) => c === channel && id === 'qa-a'), channel);
    console.log('PASS existing Reload, Mute, Expand/Restore and Remove (cancelled) controls still work');

    // Toolbar buttons open the same compact popup, and chosen items take effect in the app.
    const popupVisible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().endsWith('/player-menu.html') && w.isVisible()));
    const popupPage = () => app.windows().find((page) => page.url().endsWith('/player-menu.html'));
    const toolbarPick = async (buttonName, key) => {
        await shell.locator('.toolbar button', { hasText: buttonName }).first().click();
        await waitFor(popupVisible);
        await popupPage().locator(`[data-action="${key}"]`).click();
        await waitFor(async () => !(await popupVisible()));
    };
    await toolbarPick('Actions', 'toggleMuteAll');
    await waitFor(async () => (await shell.locator('.player-card button[title="Unmute"]').count()) === 3);
    await toolbarPick('Actions', 'toggleMuteAll');
    await waitFor(async () => (await shell.locator('.player-card button[title="Unmute"]').count()) === 0);
    await toolbarPick('Actions', 'selectAll');
    await waitFor(async () => (await shell.locator('.tb-selection').innerText()).includes('3 selected'));
    await toolbarPick('Actions', 'clearSelection');
    await waitFor(async () => (await shell.locator('.tb-selection').count()) === 0);
    await shell.locator('button[title="Grid columns and page size"]').click();
    await waitFor(popupVisible);
    await popupPage().locator('[data-action="setColumns:1"]').click();
    await waitFor(async () => !(await popupVisible()));
    await waitFor(async () => {
        const lefts = await shell.$$eval('.player-card', (cards) => cards.map((card) => Math.round(card.getBoundingClientRect().left)));
        return new Set(lefts).size === 1;
    });
    await shell.locator('button[title="Grid columns and page size"]').click();
    await waitFor(popupVisible);
    await shell.locator('button[title="Grid columns and page size"]').click({ force: true });
    await waitFor(async () => !(await popupVisible()));
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await popupVisible(), false, 'second click on Layout closes its menu');
    await toolbarPick('Remove', 'removeAll');
    await waitFor(async () => (await app.evaluate(() => global.headerQA.dialogs)) === 2);
    assert.equal(await shell.locator('.player-card').count(), 3);
    console.log('PASS toolbar Actions, Layout and Remove open the compact popup and their items take effect');
}

run().then(() => { process.exitCode = 0; }, (error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
    await app?.close().catch(() => undefined);
    for (const id of containers) { try { docker('rm', '-f', id); } catch { /* Already gone. */ } }
    rmSync(root, { recursive: true, force: true });
});
