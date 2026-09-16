import { execFile, spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import type { Socket } from 'node:net';
import Docker from 'dockerode';
import type { Player } from '../shared/types';
import type { ConsoleInfo, LogOptions } from '../shared/instanceConsole';

const exec = promisify(execFile);
export const runDocker = async (args: string[]): Promise<string> => {
    try {
        return (await exec('docker', args, { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 })).stdout;
    } catch {
        throw new Error('Docker unavailable or command failed. Check Docker and reconnect.');
    }
};

export function instanceLocation(player: Player, repo: string | null) {
    if (!player.instanceName || !/^[a-z0-9][a-z0-9_-]*$/.test(player.instanceName)) {
        throw new Error('This player has no valid Docker instance mapping.');
    }
    if (!repo) throw new Error('Set the player-swarm-docker folder in Settings.');
    const root = realpathSync(join(repo, 'instances'));
    const path = join(root, player.instanceName);
    if (!existsSync(join(path, 'docker-compose.yml'))) throw new Error('Player instance no longer exists.');
    const directory = realpathSync(path);
    const rel = relative(root, directory);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Invalid instance directory.');
    return { directory, project: `headless-player-${player.instanceName}` };
}

/** The project convention comes from create-instance.sh; container names never do. */
export class InstanceDocker {
    constructor(private readonly run = runDocker) {}

    async inspect(player: Player, repo: string | null, requested?: string): Promise<ConsoleInfo> {
        const { directory, project } = instanceLocation(player, repo);
        const services = (await this.run(['compose', '--project-directory', directory, '-f',
            join(directory, 'docker-compose.yml'), '-p', project, 'config', '--services']))
            .trim().split(/\r?\n/).filter(Boolean);
        const service = requested || (services.includes('player-server') ? 'player-server' : services[0]);
        if (!service || !services.includes(service)) throw new Error('Service is not part of this player instance.');
        const ids = (await this.run(['ps', '-a', '--no-trunc', '--filter', `label=com.docker.compose.project=${project}`,
            '--filter', `label=com.docker.compose.service=${service}`, '--filter', 'label=com.docker.compose.oneoff=False',
            '--format', '{{.ID}}'])).trim().split(/\r?\n/).filter(Boolean);
        if (ids.length !== 1 || !/^[a-f0-9]{64}$/.test(ids[0]!)) {
            throw new Error(ids.length > 1 ? 'Multiple containers found for this service; refusing an ambiguous connection.' : 'Container unavailable; reconnect when the service is running.');
        }
        const [container] = JSON.parse(await this.run(['inspect', ids[0]!])) as Docker.ContainerInspectInfo[];
        if (!container || container.Config.Labels['com.docker.compose.project'] !== project ||
            container.Config.Labels['com.docker.compose.service'] !== service) throw new Error('Container does not belong to this player.');
        const image = container.Config.Image;
        const last = image.split('/').pop()!;
        return {
            playerId: player.id, playerName: player.label || `Player ${player.instanceName!.replace(/^instance-/, '')}`,
            instanceName: player.instanceName!, directory, project, services, service,
            containerId: container.Id, containerName: container.Name.replace(/^\//, ''), image, imageId: container.Image,
            imageTag: image.includes('@') ? image.split('@')[1]! : last.includes(':') ? last.split(':')[1]! : 'latest (implicit)',
            status: container.State.Status, created: container.Created, started: container.State.StartedAt,
            ports: Object.entries(container.NetworkSettings.Ports || {}).flatMap(([port, bindings]) =>
                bindings?.map((binding) => `${binding.HostIp}:${binding.HostPort} → ${port}`) || [port]),
        };
    }

    async stats(id: string): Promise<{ cpu: string; memory: string }> {
        const stats = JSON.parse(await this.run(['stats', '--no-stream', '--format', '{{json .}}', id]));
        return { cpu: stats.CPUPerc, memory: stats.MemUsage };
    }

    logs(id: string, options: LogOptions) {
        return spawn('docker', ['logs', ...(options.follow ? ['--follow'] : []), '--tail', String(options.tail),
            ...(options.timestamps ? ['--timestamps'] : []), id], { windowsHide: true, shell: false });
    }

    async shell(id: string, columns: number, rows: number) {
        // Match the CLI's active endpoint, including Docker Desktop's named pipe.
        // No host shell or native Electron addon is involved: the daemon owns the PTY.
        const context = JSON.parse(await this.run(['context', 'inspect']))[0];
        const host: string = (!process.env.DOCKER_CONTEXT && process.env.DOCKER_HOST) || context?.Endpoints?.docker?.Host;
        if (!host || (!host.startsWith('unix://') && !host.startsWith('npipe://'))) {
            throw new Error('Terminal requires a local Docker socket or Docker Desktop named pipe. Logs remain available.');
        }
        const socketPath = host.startsWith('unix://') ? host.slice(7) : host.slice(8).replaceAll('/', '\\');
        const docker = new Docker({ socketPath, host: undefined, protocol: 'http', timeout: 15000 });
        const execution = await docker.getContainer(id).exec({
            Cmd: ['/bin/sh'], AttachStdin: true, AttachStdout: true, AttachStderr: true,
            Tty: true, Env: ['TERM=xterm-256color'],
        });
        const stream = await execution.start({ hijack: true, stdin: true, Tty: true });
        // HTTP requests are bounded; an attached terminal may legitimately sit idle.
        (stream as Socket).setTimeout(0);
        await execution.resize({ w: columns, h: rows }).catch(() => undefined);
        return { execution, stream };
    }
}
