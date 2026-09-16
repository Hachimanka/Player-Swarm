const { app, BrowserWindow, WebContentsView } = require('electron');
const { EventEmitter } = require('node:events');
const { join, resolve } = require('node:path');
const { writeFileSync } = require('node:fs');
const Module = require('node:module');
const { buildSync } = require('esbuild');
app.setPath('userData', process.env.CONSOLE_QA_DATA);
writeFileSync(join(app.getPath('userData'), 'settings.json'), JSON.stringify({ dockerRepoPath: process.env.CONSOLE_QA_REPO }));
app.whenReady().then(async () => {
    const filename = resolve(__dirname, '../out/main/console-fixture.cjs');
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(resolve(__dirname, '..'));
    mod._compile(buildSync({ entryPoints: [resolve(__dirname, '../src/main/instanceConsole.ts')], bundle: true,
        platform: 'node', format: 'cjs', write: false, packages: 'external' }).outputFiles[0].text, filename);
    const shell = new BrowserWindow({ show: false, width: 1000, height: 700,
        webPreferences: { preload: resolve(__dirname, '../out/preload/index.js'), sandbox: true, contextIsolation: true } });
    shell.webContents.on('preload-error', (_event, path, error) => console.error('QA preload:', path, error));
    const players = new EventEmitter();
    players.items = JSON.parse(process.env.CONSOLE_QA_PLAYERS);
    players.list = () => players.items;
    mod.exports.registerInstanceConsole(shell, players);
    global.consoleQA = { shell, players };
    await shell.loadURL('data:text/html,<h1>Console QA shell</h1>');
    for (let n = 0; n < 2; n++) {
        const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } });
        shell.contentView.addChildView(view);
        view.setBounds({ x: n * 300, y: 50, width: 300, height: 400 });
        await view.webContents.loadURL('about:blank');
    }
});
app.on('window-all-closed', () => app.quit());
