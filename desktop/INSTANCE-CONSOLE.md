# Instance Console

Click the **Instance Console** (`>_`) button in a Docker-backed player's card header, or choose **Open Instance Console** from its `⋮` / right-click menu. The header button appears at the `lg` and `md` card sizes; smaller cards use the menu. Each player has its own independent window; opening the same player's console again focuses it. Players added only by URL have no persisted Docker mapping, so the action is disabled for them.

The console opens on **Logs**, following the last 100 lines of the `player-server` container's stdout/stderr. The service selector is populated by `docker compose config --services`, including `player-ui` when present. Search filters displayed text; Copy and Export use that filtered text. Clear clears only the display. Last N lines and timestamps reload history. Stop following terminates the log subprocess. Reconnect reloads history using the current settings. The display retains up to 2 MB; it does not change Docker's own log retention.

**Terminal** opens `/bin/sh` in the selected container. `pm2 list` and `pm2 describe player-server` work when that image includes PM2. The terminal supports interactive input, control keys, and resizing. Disconnect closes the Docker attachment; it is not a command to stop the container or all processes launched in it. Shells are never automatically reopened after a container restart. The terminal uses the active local Docker context's Unix socket or Docker Desktop named pipe. Remote TCP/SSH contexts currently support the CLI-backed Logs and Info tabs, but not Terminal.

**Info** shows the persisted player/instance identity, Compose project, selected container ID/name, image reference/tag/image ID, status, creation/start time, uptime, ports, CPU/RAM, and instance directory. It refreshes while the console is open. Environment variables and inspect secrets are not sent to the renderer. CPU/RAM show unavailable if Docker cannot provide stats.

## Mapping and isolation

The existing source of truth remains `PlayerManager` → `Player.instanceName`, which is the `name` returned by `swarm-build.js`. The Docker repository setting locates `instances/<instanceName>/docker-compose.yml`. The project name `headless-player-<instanceName>` matches `create-instance.sh`'s `docker compose -p` argument.

`instanceDocker.ts` resolves the actual container using exact Compose project/service labels, excludes one-off containers, then verifies those labels in the inspected container. It refuses ambiguous service replicas instead of choosing one. Container names are never constructed or supplied by the renderer. The instance directory must resolve within the configured repository's instances directory.

The renderer → dedicated preload → main-process session → Docker path is bound to the console window's `webContents`. Console IPC takes service names, log options, terminal bytes and dimensions; it has no host-command or container-name API. Every request checks its sending window/main frame and the player's continued existence. The main application's IPC separately rejects console and guest senders. Existing container mounts and permissions still apply inside the shell.

The console is a separate `BrowserWindow`; it does not change the main window's player views, bounds, overlay state, or z-index. Its preload is bundled separately and self-contained for Electron's sandbox.

## Streams and lifecycle

Logs use a shell-free `spawn('docker', ['logs', ...controlledOptions, resolvedContainerId])`. Both stdout and stderr are decoded as UTF-8 and batched, with backpressure and a bounded display. No PM2 log files are read: `pm2-runtime` sends the useful output to Docker's stdout/stderr.

Terminal uses Dockerode's exec/create/start/resize API with `Tty: true` and a fixed `/bin/sh` command. Docker owns the PTY; xterm renders it. This avoids adding `node-pty` or a native PTY rebuild requirement to Electron packaging. See [Docker exec/TTY API](https://docs.docker.com/reference/api/engine/version/v1.46/) and [Dockerode's exec stream documentation](https://github.com/apocas/dockerode). Terminal output pauses until xterm acknowledges rendering it.

Only open consoles create streams/pollers. Service changes invalidate old generations before reconnecting, so pending output cannot cross services. Container replacement/restart is detected using its ID and start time. Following logs reconnect automatically and insert a history boundary before replaying recent output, which can intentionally repeat some lines. Container shells require an explicit reconnect. Removing a player disables its console and releases attachments. Closing a console, renderer failure, or closing the main window releases its subprocesses, sockets and timers.

## Validation

From `desktop/`:

```powershell
npm run typecheck
npm run test:console
npx electron-vite build
node tests/console-live.cjs C:/path/to/player-swarm-docker
node tests/console-electron.cjs
npx electron-builder --dir --win
```

`console-live.cjs` checks existing instances 1, 3 and 12 without restarting them: exact backend/UI mapping, log history, container identity, PM2 inspection and terminal resize. Supply a repository that contains those instances.

`console-electron.cjs` requires Docker, a local `nginx:alpine` image and a graphical Electron session. It creates four disposable, labelled QA containers and temporary settings. It tests two real console windows, player isolation, follow/stop, search, clear, copy, export, container terminal, service changes, restart/reconnect, Info, removal, and unchanged guest-view bounds. It removes only those test containers and its temporary files when done. Docker-unavailable behavior, invalid IPC senders, late resolution and stale-stream rejection are also covered by the unit tests.
