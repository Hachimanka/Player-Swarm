import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import {
    IPC,
    type BuildInstanceRequest,
    type BuildInstanceResult,
    type BuildProgressEvent,
    type DeleteInstanceResult,
} from '@shared/types';

/**
 * Shells out to player-swarm-docker's swarm-build.js rather than
 * reimplementing its Docker/database orchestration here - that script wraps
 * install-build.sh/add-instance.sh (with all of this project's own
 * Docker-specific fixes already baked in) and emits one JSON object per
 * line on stdout, one per build phase - see swarm-build.js's own header
 * comment for the exact shape. Everything the underlying bash/npm/docker
 * commands print themselves arrives on stderr instead, forwarded here as
 * {phase:'log'} events for a live progress view - not a phase transition.
 *
 * Uses `process.execPath` with ELECTRON_RUN_AS_NODE rather than depending on
 * a system `node` being on PATH - the standard Electron pattern for running
 * a plain Node script from the main process, works the same whether this
 * app is running from source or packaged.
 */
export async function buildInstance(
    win: BrowserWindow,
    dockerRepoPath: string,
    request: BuildInstanceRequest,
): Promise<BuildInstanceResult> {
    const scriptPath = join(dockerRepoPath, 'swarm-build.js');
    if (!existsSync(scriptPath)) {
        throw new Error(
            `swarm-build.js not found in ${dockerRepoPath} - check the player-swarm-docker folder location in Settings.`,
        );
    }

    const args = ['swarm-build.js'];
    if (request.imagePath) {
        args.push(`--image=${request.imagePath}`);
    } else if (request.serverZipPath && request.uiZipPath) {
        args.push(`--server=${request.serverZipPath}`, `--ui=${request.uiZipPath}`);
    } else if (request.serverZipPath || request.uiZipPath) {
        throw new Error('Provide both a player-server and player-ui archive, not just one.');
    }
    // Neither provided at all - pass no --server/--ui/--image, letting
    // swarm-build.js reuse whatever's already built in ./extracted/ instead
    // of re-extracting/rebuilding from scratch every time (it fails fast
    // with a clear message if there's genuinely no build there yet).
    if (request.env) args.push(`--env=${request.env}`);
    if (request.license) args.push(`--license=${request.license}`);

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, {
            cwd: dockerRepoPath,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        });

        let settled = false;
        const send = (event: BuildProgressEvent): void => win.webContents.send(IPC.buildProgress, event);

        createInterface({ input: child.stdout }).on('line', (line) => {
            let event: BuildProgressEvent;
            try {
                event = JSON.parse(line) as BuildProgressEvent;
            } catch {
                return; // stdout is reserved for JSON progress lines only - ignore anything else
            }

            send(event);

            if (event.phase === 'error') {
                settled = true;
                reject(new Error(event.message ?? 'Instance build failed.'));
            } else if (event.phase === 'done' && event.name && event.url) {
                settled = true;
                resolve({ name: event.name, url: event.url });
            }
        });

        child.stderr.on('data', (chunk: Buffer) => send({ phase: 'log', message: chunk.toString() }));

        child.on('error', (err) => {
            if (!settled) reject(err);
        });

        child.on('close', (code) => {
            if (!settled) reject(new Error(`swarm-build.js exited unexpectedly (code ${code}).`));
        });
    });
}

/**
 * Tears down a player-swarm-docker instance via `swarm-build.js --remove=`
 * (which itself wraps remove-instance.sh - see that script's header for what
 * actually happens: docker compose down + delete instances/<name>/). Same
 * spawn/JSON-line-parsing shape as buildInstance() above, just without a
 * `url` on the terminal 'done' event - there's no URL left once the
 * instance is gone.
 */
export async function deleteInstance(
    win: BrowserWindow,
    dockerRepoPath: string,
    name: string,
): Promise<DeleteInstanceResult> {
    const scriptPath = join(dockerRepoPath, 'swarm-build.js');
    if (!existsSync(scriptPath)) {
        throw new Error(
            `swarm-build.js not found in ${dockerRepoPath} - check the player-swarm-docker folder location in Settings.`,
        );
    }

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['swarm-build.js', `--remove=${name}`], {
            cwd: dockerRepoPath,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        });

        let settled = false;
        const send = (event: BuildProgressEvent): void => win.webContents.send(IPC.buildProgress, event);

        createInterface({ input: child.stdout }).on('line', (line) => {
            let event: BuildProgressEvent;
            try {
                event = JSON.parse(line) as BuildProgressEvent;
            } catch {
                return;
            }

            send(event);

            if (event.phase === 'error') {
                settled = true;
                reject(new Error(event.message ?? `Failed to remove instance ${name}.`));
            } else if (event.phase === 'done') {
                settled = true;
                resolve({ deleted: true });
            }
        });

        child.stderr.on('data', (chunk: Buffer) => send({ phase: 'log', message: chunk.toString() }));

        child.on('error', (err) => {
            if (!settled) reject(err);
        });

        child.on('close', (code) => {
            if (!settled) reject(new Error(`swarm-build.js --remove exited unexpectedly (code ${code}).`));
        });
    });
}
