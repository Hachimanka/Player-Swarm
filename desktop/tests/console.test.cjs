const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');

function load(file, mocks = {}) {
    const filename = resolve(__dirname, '..', file);
    const compiled = buildSync({ entryPoints: [filename], bundle: true, platform: 'node', format: 'cjs',
        write: false, packages: 'external', external: Object.keys(mocks) }).outputFiles[0].text;
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(resolve(__dirname, '..'));
    const original = mod.require.bind(mod);
    mod.require = (id) => Object.hasOwn(mocks, id) ? mocks[id] : original(id);
    mod._compile(compiled, filename);
    return mod.exports;
}
const { InstanceDocker, instanceLocation } = load('src/main/instanceDocker.ts');
const player = (n) => ({ id: `player-${n}`, instanceName: `instance-${n}`, url: 'about:blank', partition: `test-${n}`, muted: true });
function info(n, service = 'player-server') {
    return { playerId: `player-${n}`, playerName: `Player ${n}`, instanceName: `instance-${n}`, directory: '/test',
        project: `headless-player-instance-${n}`, services: ['player-server', 'player-ui'], service,
        containerId: String(n).padStart(64, 'a'), containerName: `headless-player-instance-${n}-${service}-1`,
        status: 'running', started: '2026-01-01', image: 'test:1', ports: [] };
}

test('mapping uses persisted instance, exact Compose labels and validates inspected ownership', async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'swarm-console-mapping-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const n of [1, 3, 12]) { mkdirSync(join(root, 'instances', `instance-${n}`), { recursive: true }); writeFileSync(join(root, 'instances', `instance-${n}`, 'docker-compose.yml'), 'services: {}'); }
    for (const n of [1, 3, 12]) {
        const id = String(n).padStart(64, 'a');
        const calls = [];
        let wrongProject = false;
        const adapter = new InstanceDocker(async (args) => {
            calls.push(args);
            if (args[0] === 'compose') return 'player-server\nplayer-ui\n';
            if (args[0] === 'ps') return `${id}\n`;
            return JSON.stringify([{ Id: id, Name: `/actual-${n}`, Image: 'sha256:image', Created: 'today',
                Config: { Image: 'registry:5000/player:build-42', Env: ['SECRET=never-return'], Labels: {
                    'com.docker.compose.project': `headless-player-instance-${wrongProject ? 99 : n}`,
                    'com.docker.compose.service': 'player-server' } }, State: { Status: 'running', StartedAt: 'today' }, NetworkSettings: { Ports: {} } }]);
        });
        const result = await adapter.inspect(player(n), root);
        assert.equal(result.containerId, id);
        assert.equal(result.imageTag, 'build-42');
        assert.ok(calls[1].includes(`label=com.docker.compose.project=headless-player-instance-${n}`));
        assert.ok(calls[1].includes('label=com.docker.compose.service=player-server'));
        assert.ok(!JSON.stringify(result).includes('SECRET'));
        await assert.rejects(adapter.inspect(player(n), root, 'other-service'), /not part/);
        wrongProject = true;
        await assert.rejects(adapter.inspect(player(n), root), /does not belong/);
    }
    assert.throws(() => instanceLocation({ ...player(1), instanceName: '../../outside' }, root), /valid Docker/);
});

const streams = [];
let fail = false;
let restarted = false;
let pendingInspect;
class FakeDocker {
    async inspect(p, repo, service) {
        if (fail) throw new Error('Docker unavailable — reconnect');
        if (pendingInspect) await pendingInspect;
        return { ...info(p.id.split('-')[1], service), started: restarted ? '2026-02-01' : '2026-01-01' };
    }
    async stats() { return { cpu: '1%', memory: '10 MB' }; }
    logs(id, options) {
        const child = new EventEmitter();
        child.stdout = new PassThrough(); child.stderr = new PassThrough();
        child.kill = () => { child.killed = true; };
        streams.push({ id, options, child });
        return child;
    }
    async shell() {
        const stream = new PassThrough();
        return { stream, execution: { resize: async () => {} } };
    }
}
const handlers = new Map();
const windows = [];
class FakeWindow extends EventEmitter {
    constructor() {
        super(); this.id = windows.length + 1; this.events = [];
        this.webContents = new EventEmitter();
        Object.assign(this.webContents, { id: this.id, mainFrame: {}, send: (channel, event) => this.events.push(event), setWindowOpenHandler() {} });
        windows.push(this);
    }
    isDestroyed() { return false; }
    setTitle() {} setMenu() {} loadFile() {} loadURL() {} show() {} focus() {}
    close() { this.emit('closed'); }
}
const { ConsoleSession, registerInstanceConsole } = load('src/main/instanceConsole.ts', {
    electron: { BrowserWindow: FakeWindow, ipcMain: { handle: (name, fn) => handlers.set(name, fn), on: (name, fn) => handlers.set(name, fn) }, clipboard: {}, dialog: {} },
    './instanceDocker': { InstanceDocker: FakeDocker }, './settings': { getDockerRepoPath: () => '/test' },
});

test('sessions isolate players; service switch rejects stale output; close releases streams', async () => {
    const players = { list: () => [player(1), player(12)] };
    const a = new ConsoleSession(new FakeWindow(), 'player-1', players);
    const b = new ConsoleSession(new FakeWindow(), 'player-12', players);
    try {
        await a.logs({ tail: 100, follow: true, timestamps: true }, 1);
        const old = streams.at(-1).child;
        await b.logs({ tail: 100, follow: true, timestamps: true }, 1);
        old.stdout.write('only-player-1\n'); streams.at(-1).child.stderr.write('only-player-12\n');
        a.flush(); b.flush();
        assert.match(JSON.stringify(a.win.events), /only-player-1/);
        assert.ok(!JSON.stringify(a.win.events).includes('only-player-12'));
        assert.ok(!JSON.stringify(b.win.events).includes('only-player-1\\n'));
        await a.select('player-ui');
        assert.equal(old.killed, true);
        old.stdout.write('stale-output'); a.flush();
        assert.ok(!JSON.stringify(a.win.events).includes('stale-output'));
        await a.logs({ tail: 5, follow: false, timestamps: false }, 2);
        const current = streams.at(-1).child;
        a.win.close(); assert.equal(current.killed, true);
    } finally { a.dispose(); b.dispose(); }
});

test('restart, Docker loss, stopped follow and player removal lifecycle', async () => {
    let live = [player(3)];
    const session = new ConsoleSession(new FakeWindow(), 'player-3', { list: () => live });
    try {
        await session.logs({ tail: 100, follow: true, timestamps: true }, 1);
        const original = streams.at(-1).child;
        restarted = true; await session.poll();
        assert.equal(original.killed, true);
        assert.ok(session.win.events.some((e) => e.message?.includes('Container restarted')));
        fail = true; await session.poll();
        assert.ok(session.win.events.some((e) => e.message?.includes('Docker unavailable')));
        fail = false;
        session.stopLogs(); const count = streams.length; await session.poll(); assert.equal(streams.length, count);
        await session.terminal(1, 80, 24);
        const terminal = session.shell.stream;
        live = []; assert.throws(() => session.checkPlayer(), /no longer exists/);
        assert.equal(terminal.destroyed, true);
        assert.ok(session.win.events.some((e) => e.type === 'removed'));
    } finally { fail = false; restarted = false; session.dispose(); }
});

test('closing while resolution is pending cannot create a late stream', async () => {
    const session = new ConsoleSession(new FakeWindow(), 'player-1', { list: () => [player(1)] });
    let release;
    pendingInspect = new Promise((resolve) => { release = resolve; });
    const count = streams.length;
    const result = session.logs({ tail: 100, follow: true, timestamps: false }, 1);
    session.dispose(); release(); pendingInspect = undefined;
    await assert.rejects(result, /closed/);
    assert.equal(streams.length, count);
});

test('IPC binds a console to its sender, rejects guests/subframes and arbitrary services/options', async () => {
    const shell = new FakeWindow();
    const players = new EventEmitter(); players.list = () => [player(12)];
    registerInstanceConsole(shell, players);
    const event = { sender: shell.webContents, senderFrame: shell.webContents.mainFrame };
    const open = handlers.get('instance-console:open');
    assert.throws(() => open({ sender: new FakeWindow().webContents }, 'player-12'), /Unauthorized/);
    open(event, 'player-12'); const consoleWindow = windows.at(-1);
    const consoleEvent = { sender: consoleWindow.webContents, senderFrame: consoleWindow.webContents.mainFrame };
    const inspect = handlers.get('instance-console:inspect');
    assert.throws(() => inspect(event), /Unauthorized/);
    assert.throws(() => inspect({ ...consoleEvent, senderFrame: {} }), /Unauthorized/);
    assert.equal((await inspect(consoleEvent)).playerId, 'player-12');
    await assert.rejects(handlers.get('instance-console:select')(consoleEvent, 'foreign'), /Invalid service/);
    await assert.rejects(handlers.get('instance-console:logs')(consoleEvent, { tail: '--all' }, 1), /Invalid log/);
    await assert.rejects(handlers.get('instance-console:terminal')(consoleEvent, 1, -1, 24), /Invalid terminal/);
    shell.close();
});

module.exports = { load };
