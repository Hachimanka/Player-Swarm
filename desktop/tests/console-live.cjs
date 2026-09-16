// Opt-in read-only/container-log smoke check. Does not restart existing players.
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const filename = resolve(__dirname, '../src/main/instanceDocker.ts');
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(resolve(__dirname, '..'));
mod._compile(buildSync({ entryPoints: [filename], bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external' }).outputFiles[0].text, filename);
const { InstanceDocker } = mod.exports;
const adapter = new InstanceDocker();
const repo = resolve(process.argv[2] || '../../Player-Swarm-Docker');

async function run() {
    const ids = new Set();
    for (const n of [1, 3, 12]) {
        const info = await adapter.inspect({ id: `qa-${n}`, instanceName: `instance-${n}` }, repo);
        assert.equal(info.project, `headless-player-instance-${n}`);
        assert.equal(info.service, 'player-server');
        assert.ok(!ids.has(info.containerId)); ids.add(info.containerId);
        const ui = await adapter.inspect({ id: `qa-${n}`, instanceName: `instance-${n}` }, repo, 'player-ui');
        assert.notEqual(ui.containerId, info.containerId);
        const logs = adapter.logs(info.containerId, { tail: 10, follow: false, timestamps: true });
        let bytes = 0;
        logs.stdout.on('data', (chunk) => { bytes += chunk.length; });
        logs.stderr.on('data', (chunk) => { bytes += chunk.length; });
        await new Promise((ok, reject) => { logs.on('error', reject); logs.on('close', (code) => code === 0 ? ok() : reject(Error('Logs failed'))); });
        assert.ok(bytes > 0);
        const { execution, stream } = await adapter.shell(info.containerId, 90, 28);
        let output = '';
        const done = new Promise((ok, reject) => {
            const timer = setTimeout(() => reject(Error(`Container ${n} terminal timed out`)), 20000);
            stream.on('data', (data) => {
                output += data.toString();
                if (output.includes('__QA_DONE__')) { clearTimeout(timer); ok(); }
            });
            stream.on('error', (error) => { clearTimeout(timer); reject(error); });
        });
        // Split marker literals so echoed input cannot satisfy output assertions.
        stream.write("test -f /.dockerenv && printf '__CONTAINER_%s__\\n' OK; hostname; pm2 list; pm2 describe player-server; printf '__QA_%s__\\n' DONE\r");
        try {
            await done;
            assert.ok(output.includes('__CONTAINER_OK__'));
            assert.ok(output.includes(info.containerId.slice(0, 12)));
            assert.ok(output.includes('player-server'));
            assert.ok(output.includes('/dev/null'));
            await execution.resize({ w: 100, h: 35 });
            stream.write('exit\r');
        } finally { stream.destroy(); }
        console.log(`PASS instance-${n}: exact backend/UI mapping, Docker history, container TTY, pm2 list/describe, resize`);
    }
}
run().catch((error) => { console.error(error.message); process.exitCode = 1; });
