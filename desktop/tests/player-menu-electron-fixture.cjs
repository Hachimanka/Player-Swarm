const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const { resolve } = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');
app.setPath('userData', process.env.MENU_QA_DATA);
app.whenReady().then(async () => {
    const filename = resolve(__dirname, '../out/main/menu-fixture.cjs');
    const mod = new Module(filename, module);
    mod.paths = Module._nodeModulePaths(resolve(__dirname, '..'));
    mod._compile(buildSync({ entryPoints: [resolve(__dirname, '../src/main/playerContextMenu.ts')],
        bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external' }).outputFiles[0].text, filename);
    const shell = new BrowserWindow({ x: 100, y: 100, width: 900, height: 650, show: true,
        webPreferences: { preload: resolve(__dirname, '../out/preload/index.js'), sandbox: true, contextIsolation: true } });
    let available = true;
    const menu = new mod.exports.PlayerContextMenu(shell, (id) => available && id === 'qa-player');
    ipcMain.on('ui:show-toolbar-menu', (event, request) => {
        if (event.sender === shell.webContents && event.senderFrame === shell.webContents.mainFrame) menu.show(request);
    });
    await shell.loadURL('data:text/html,<style>body{background:%230f1115;color:white}</style><button>QA menu parent</button>');
    const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } });
    shell.contentView.addChildView(view);
    view.setBounds({ x: 20, y: 80, width: 800, height: 450 });
    await view.webContents.loadURL('data:text/html,<style>body{background:%231d212a;color:white}</style>Player content');
    global.menuQA = { shell, menu, view, remove: () => { available = false; menu.validatePlayer(); } };
});
app.on('window-all-closed', () => app.quit());
