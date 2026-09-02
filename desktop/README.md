# Player Swarm (desktop)

A desktop app that hosts many independent, isolated Chromium instances ("players") inside a single window. This is Phase 1 ("core") of the brief in [`../INITPROJECT.md`](../INITPROJECT.md): the app shell, Add/Remove Player, and the responsive grid.

## Stack

Electron 43 + TypeScript (main, preload, renderer) + Vite (via [`electron-vite`](https://electron-vite.org)) for the renderer bundle + `electron-builder` for packaging. Vanilla TS + CSS Grid for the shell UI, no framework.

## Architecture decision: `WebContentsView`, not `<webview>`

Each player is a `WebContentsView` created and owned entirely by the main process ([`src/main/playerManager.ts`](src/main/playerManager.ts)), not a `<webview>` tag in the renderer. Reasons:

- **Lifecycle control.** The main process can create, reposition, and destroy a player's `WebContentsView` deterministically. A `<webview>` ties guest lifecycle to the renderer's DOM, which is a worse fit for "single source of truth lives in main" (see [Code conventions](../INITPROJECT.md#7-code-conventions)).
- **Security posture.** `<webview>` has a well-documented history of security footguns and its own quirky IPC/permission model. `WebContentsView` guests get the same `contextIsolation`/`sandbox`/`nodeIntegration: false` defaults as any other `WebContents`, with **no preload script at all** — they get no bridge to Node or to the app's IPC surface.
- **It's the maintained path.** `BrowserView` (the older equivalent) is deprecated; `WebContentsView` is Electron's current recommendation.

**The trade-off, and how it's handled:** a `WebContentsView` is not a DOM node — it can't be visually contained by renderer HTML. Two consequences, both solved in this codebase:

1. **Positioning.** The renderer lays out placeholder grid cells ([`src/renderer/grid.ts`](src/renderer/grid.ts)) and reports each cell's `getBoundingClientRect()` to the main process over IPC (`grid:report-bounds`) whenever the layout changes (player added/removed, window resize, via a `ResizeObserver` + an explicit report after every render). The main process matches each report to its `WebContentsView` and calls `setBounds()`. There is no other way to keep them in sync — nothing does this automatically.
2. **Stacking.** `contentView.addChildView()` always stacks guest views **above** the shell renderer's own layer — there's no z-index to negotiate. Any renderer-drawn overlay (currently just the "Add Player" modal) would render underneath every player and be invisible. The renderer calls `window.playerSwarm.setOverlayVisible(true/false)` when it opens/closes such an overlay; the main process responds by collapsing every guest view to `0×0` (and restoring its last known bounds on close) — see `PlayerManager.setOverlayVisible()`. This is the mechanism to reach for whenever a new renderer-drawn overlay is added later.

## Session-partition model

Every player gets a stable UUID at creation and a Chromium session partition of `persist:player-<uuid>`. That's what actually gives each player its own cookies, localStorage, and cache — Chromium persists a `persist:`-prefixed partition to disk under `userData` on its own, independent of anything this app does.

Phase 1 does **not** persist the player list itself (which players existed, their URLs) — that's Phase 3 ("Persist layout"). Right now, the list of players lives only in the main process's memory ([`src/main/store.ts`](src/main/store.ts)) for the lifetime of the run. Restarting the app currently loses the list, though any partition that isn't purged still has its cookies sitting on disk, ready to be reattached once Phase 3 wires up loading the saved list back into `PlayerManager`.

## Adding a player programmatically

From the renderer (or via the DevTools console pointed at the shell window):

```js
const player = await window.playerSwarm.addPlayer('https://example.com'); // omit url for a blank page
// => { id: 'uuid', url: 'https://example.com', partition: 'persist:player-uuid' }

await window.playerSwarm.removePlayer(player.id); // prompts to optionally purge session data
```

`window.playerSwarm` is the typed API exposed by [`src/preload/index.ts`](src/preload/index.ts) via `contextBridge` — see [`src/shared/types.ts`](src/shared/types.ts) (`PlayerSwarmAPI`) for the full surface.

## Known limits (Phase 1)

Everything explicitly deferred to a later phase in the brief is not built yet: per-player URL bar / back / forward / mute / DevTools button / error card, crash watchdog, disk persistence of the player list across restarts, custom User-Agent, rename/label, maximize-to-single-view, bulk-add, per-player memory readout, and the global Reload All / Mute All / Close All actions.

## Measured memory

Measured via summed RSS (`ps`) across every process belonging to the app (main + gpu + utility + zygotes + broker + one renderer per player), on a shared Linux dev machine with `--disable-gpu` (GPU acceleration hit driver issues in that sandbox unrelated to the app — see Gotchas):

| Players        | Total RSS             | Delta per player |
| -------------- | --------------------- | ---------------- |
| 0 (shell only) | ~696 MB               | —                |
| 1              | ~836 MB               | ~140 MB          |
| 6              | ~2,533 MB<sup>†</sup> | ~380 MB avg      |

<sup>†</sup> This run's 6-player number is inflated by stray players created from manual testing happening concurrently on the same shared machine during measurement (not a leak) — treat the 1-player delta (~140 MB) as the more reliable per-player figure, in line with the brief's 150–350 MB/player budget. The 10–12 player target from the brief should be re-measured on a clean, dedicated machine before relying on it.

## Development

```bash
npm install
npm run dev         # electron-vite dev — hot reload, visible window
npm run typecheck   # tsc --noEmit against both main/preload and renderer configs
npm run build        # electron-vite build + electron-builder — packaged app in release/
```

## Gotchas hit while building this

- **`--ozone-platform=wayland` + Vulkan don't mix** on this dev machine, causing GPU-process errors. `ELECTRON_OZONE_PLATFORM_HINT=x11` (or just `--disable-gpu` for headless/CI verification) avoids it. Not required on most end-user machines.
- **electron-vite's entry auto-detection expects `src/preload/index.ts` exactly** — a differently-named preload entry point silently fails to build until you set `build.rollupOptions.input` explicitly in `electron.vite.config.ts`.
- **TypeScript 7 isn't usable yet** — `@typescript-eslint` currently caps support at `<6.1.0`. This repo pins TypeScript to `^6.0.3`.
