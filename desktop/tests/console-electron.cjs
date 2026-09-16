// End-to-end tests use isolated disposable containers and temporary app settings.
const assert = require('node:assert/strict');
const { _electron } = require('playwright-core');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30000 }).trim();
const root = mkdtempSync(join(tmpdir(), 'swarm-console-e2e-'));
const containers = [];
let electron;
const waitFor = async (fn, timeout = 20000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await fn()) return; await new Promise((resolve) => setTimeout(resolve, 150)); }
    throw new Error('Timed out waiting for console state');
};
async function run() {
    const players = [];
    for (const n of [1, 2]) {
        const name = `console-qa-${Date.now()}-${n}`;
        const directory = join(root, 'instances', name);
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, 'docker-compose.yml'), 'services:\n  player-server:\n    image: nginx:alpine\n  player-ui:\n    image: nginx:alpine\n');
        players.push({ id: `qa-${n}`, instanceName: name, label: `QA Player ${n}` });
        for (const service of ['player-server', 'player-ui']) {
            const id = docker('run', '-d', '--label', `com.docker.compose.project=headless-player-${name}`,
                '--label', `com.docker.compose.service=${service}`, '--label', 'com.docker.compose.oneoff=False',
                'nginx:alpine', 'sh', '-c', `while true; do echo ONLY_PLAYER_${n}_${service}; sleep 1; done`);
            containers.push(id);
        }
    }
    const data = join(root, 'app-data'); mkdirSync(data);
    const env = { ...process.env, CONSOLE_QA_DATA: data, CONSOLE_QA_REPO: root, CONSOLE_QA_PLAYERS: JSON.stringify(players) };
    delete env.ELECTRON_RUN_AS_NODE;
    electron = await _electron.launch({ executablePath: require('electron'), args: [resolve(__dirname, 'console-electron-fixture.cjs')], env });
    electron.process().stderr.on('data', (data) => process.stderr.write(data));
    electron.on('window', (page) => page.on('pageerror', (error) => console.error('Console renderer:', error.message)));
    const shell = await electron.firstWindow();
    shell.on('pageerror', (error) => console.error('Shell renderer:', error.message));
    await shell.waitForFunction(() => Boolean(window.playerSwarm));
    const open = async (id) => {
        const previous = new Set(electron.windows());
        await shell.evaluate((id) => window.playerSwarm.openInstanceConsole(id), id);
        await waitFor(() => electron.windows().some((page) => !previous.has(page) && page.url().endsWith('/console.html')));
        const page = electron.windows().find((page) => !previous.has(page) && page.url().endsWith('/console.html'));
        await page.waitForSelector('.console-log');
        return page;
    };
    const a = await open('qa-1');
    const b = await open('qa-2');
    await waitFor(async () => (await a.locator('.console-log').innerText()).includes('ONLY_PLAYER_1'));
    await waitFor(async () => (await b.locator('.console-log').innerText()).includes('ONLY_PLAYER_2'));
    assert.ok(!(await a.locator('.console-log').innerText()).includes('ONLY_PLAYER_2'));
    assert.ok(!(await b.locator('.console-log').innerText()).includes('ONLY_PLAYER_1'));
    console.log('PASS real Electron: separate windows, sandbox preloads, live follow and player isolation');
    await a.getByRole('button', { name: 'Stop following', exact: true }).click();
    const stopped = await a.locator('.console-log').innerText();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal(await a.locator('.console-log').innerText(), stopped);
    await a.getByRole('button', { name: 'Clear', exact: true }).click();
    await waitFor(async () => (await a.locator('.console-log').innerText()) === '');
    await a.getByRole('button', { name: 'Reconnect', exact: true }).first().click();
    await waitFor(async () => (await a.locator('.console-log').innerText()).includes('ONLY_PLAYER_1'));
    await a.getByRole('textbox', { name: 'Search logs' }).fill('DOES_NOT_EXIST');
    await waitFor(async () => (await a.locator('.console-log').innerText()) === '');
    await a.getByRole('textbox', { name: 'Search logs' }).fill('ONLY_PLAYER_1');
    await a.getByRole('button', { name: 'Copy', exact: true }).click();
    assert.ok((await electron.evaluate(({ clipboard }) => clipboard.readText())).includes('ONLY_PLAYER_1'));
    const exported = join(root, 'export.log');
    await electron.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, exported);
    await a.getByRole('button', { name: 'Export', exact: true }).click();
    await waitFor(() => { try { return readFileSync(exported, 'utf8').includes('ONLY_PLAYER_1'); } catch { return false; } });
    await a.getByRole('textbox', { name: 'Search logs' }).fill('');
    await a.getByRole('button', { name: 'Follow', exact: true }).click();
    console.log('PASS log controls: stop, clear, history, search, clipboard and export');
    await a.evaluate(() => {
        window.qaTerminalText = '';
        window.instanceConsole.onEvent((event) => { if (event.type === 'terminal') window.qaTerminalText += event.data; });
    });
    await a.bringToFront();
    await a.getByRole('button', { name: 'Terminal', exact: true }).click();
    await waitFor(async () => (await a.locator('footer').nth(1).innerText()).includes('Connected inside'));
    await a.locator('.xterm-helper-textarea').focus();
    await a.keyboard.type("test -f /.dockerenv && printf '__INSIDE_%s__\\n' CONTAINER; hostname");
    await a.keyboard.press('Enter');
    await waitFor(async () => (await a.evaluate(() => window.qaTerminalText)).includes('__INSIDE_CONTAINER__'));
    assert.ok((await a.evaluate(() => window.qaTerminalText)).includes(containers[0].slice(0, 12)));
    mkdirSync(resolve(__dirname, '../release'), { recursive: true });
    await a.screenshot({ path: resolve(__dirname, '../release/instance-console-qa.png') });
    await a.getByRole('combobox', { name: 'Container service' }).selectOption('player-ui');
    await waitFor(async () => {
        const selected = await a.evaluate(() => window.instanceConsole.inspect());
        return selected.containerId === containers[1] && (await a.locator('footer').nth(1).innerText()).includes(`Connected inside ${selected.containerName}`);
    });
    await a.getByRole('button', { name: 'Logs', exact: true }).click();
    await waitFor(async () => (await a.locator('.console-log').innerText()).includes('ONLY_PLAYER_1_player-ui'));
    assert.ok(!(await a.locator('.console-log').innerText()).includes('ONLY_PLAYER_1_player-server'));
    await a.getByRole('combobox', { name: 'Container service' }).selectOption('player-server');
    await waitFor(async () => (await a.locator('.console-log').innerText()).includes('ONLY_PLAYER_1_player-server'));
    docker('restart', containers[0]);
    await waitFor(async () => (await a.locator('.console-log').innerText()).includes('Reconnected:'), 30000);
    await a.getByRole('button', { name: 'Info', exact: true }).click();
    assert.ok((await a.locator('.console-info').innerText()).includes(containers[0]));
    console.log('PASS container terminal, service switching, restart/reconnect and Info');
    const before = await electron.evaluate(() => global.consoleQA.shell.contentView.children.map((v) => v.getBounds()));
    await electron.evaluate(() => global.consoleQA.shell.setSize(1200, 850));
    const after = await electron.evaluate(() => global.consoleQA.shell.contentView.children.map((v) => v.getBounds()));
    assert.deepEqual(after, before);
    await electron.evaluate(() => { global.consoleQA.players.items = global.consoleQA.players.items.filter((p) => p.id !== 'qa-1'); global.consoleQA.players.emit('changed'); });
    await a.getByRole('alert').filter({ hasText: 'Player instance no longer exists.' }).waitFor();
    assert.equal(await a.getByRole('combobox', { name: 'Container service' }).isDisabled(), true);
    await a.close();
    assert.ok((await b.locator('.console-log').innerText()).includes('ONLY_PLAYER_2'));
    console.log('PASS removal, independent console cleanup and unchanged WebContentsView bounds');
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (electron) await electron.close();
    for (const id of containers) docker('rm', '-f', id);
    rmSync(root, { recursive: true, force: true });
});
