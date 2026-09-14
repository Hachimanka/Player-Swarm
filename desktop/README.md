# Player Swarm (desktop)

A desktop app that hosts many independent, isolated Chromium instances ("players") inside a single window, per the brief in [`../INITPROJECT.md`](../INITPROJECT.md). Phases 1, 2, and most of 3/4 are built - see [Known limits](#known-limits) for the honest remaining gap list.

## Stack

Electron 43 + TypeScript (main, preload, renderer) + Vite (via [`electron-vite`](https://electron-vite.org)) for the renderer bundle + `electron-builder` for packaging. The shell UI is Angular (standalone components, signals) + Tailwind CSS + [`@ntv360/component-pantry`](https://www.npmjs.com/package/@ntv360/component-pantry) for UI elements - a deliberate deviation from the brief's original "vanilla TS + CSS Grid, no framework" suggestion, made when the UI was asked to adopt this org's internal component library. CSS Grid is still what the player layout itself uses; Angular is just the rendering framework around it now.

## Architecture decision: `WebContentsView`, not `<webview>`

Each player is a `WebContentsView` created and owned entirely by the main process ([`src/main/playerManager.ts`](src/main/playerManager.ts)), not a `<webview>` tag in the renderer. Reasons:

- **Lifecycle control.** The main process can create, reposition, and destroy a player's `WebContentsView` deterministically. A `<webview>` ties guest lifecycle to the renderer's DOM, which is a worse fit for "single source of truth lives in main" (see [Code conventions](../INITPROJECT.md#7-code-conventions)).
- **Security posture.** `<webview>` has a well-documented history of security footguns and its own quirky IPC/permission model. `WebContentsView` guests get the same `contextIsolation`/`sandbox`/`nodeIntegration: false` defaults as any other `WebContents`, with **no preload script at all** — they get no bridge to Node or to the app's IPC surface.
- **It's the maintained path.** `BrowserView` (the older equivalent) is deprecated; `WebContentsView` is Electron's current recommendation.

**The trade-off, and how it's handled:** a `WebContentsView` is not a DOM node — it can't be visually contained by renderer HTML. Two consequences, both solved in this codebase:

1. **Positioning.** The renderer lays out placeholder grid cells ([`src/renderer/grid.component.ts`](src/renderer/grid.component.ts)) and reports each cell's `getBoundingClientRect()` to the main process over IPC (`grid:report-bounds`) whenever the layout changes (player added/removed, window resize, scrolling the maximize-mode thumbnail strip, via a `ResizeObserver` + an explicit report after every render). The main process matches each report to its `WebContentsView` and calls `setBounds()`. There is no other way to keep them in sync — nothing does this automatically.
2. **Stacking.** `contentView.addChildView()` always stacks guest views **above** the shell renderer's own layer — there's no z-index to negotiate. Any renderer-drawn overlay (the "Add Player" modal, a per-player crash/error card, a floating status badge) would render underneath every player and be invisible. Two mechanisms handle this, both in `PlayerManager`:
    - **App-wide overlays** (the modal): the renderer calls `window.playerSwarm.setOverlayVisible(true/false)`; the main process collapses every guest view to `0×0` and restores last-known bounds on close (`setOverlayVisible()`).
    - **Per-player overlays** (a crashed/errored player's own error card): the same `0×0` trick, scoped to just that one player (`setPlayerError()`/`clearPlayerError()`), so the rest of the grid stays interactive while one player is showing its recovery card.
    - A genuinely floating, always-visible renderer element (the "build in progress" badge) instead reserves real, measured layout space via CSS padding that the grid's own bounds math never assigns to a player - see `.grid-mount--reserve-badge` in `style.css`. Reach for the `0×0`-hide approach for anything tied to a specific overlay's open/close lifecycle; reach for reserved layout space for something that needs to coexist with a full player grid indefinitely.

## Session-partition model

Every player gets a stable UUID at creation and a Chromium session partition of `persist:player-<uuid>`. That's what actually gives each player its own cookies, localStorage, and cache — Chromium persists a `persist:`-prefixed partition to disk under `userData` on its own, independent of anything this app does.

The player list itself (which players existed, their URLs) is persisted too (Phase 3, "Persist layout") — [`src/main/store.ts`](src/main/store.ts) writes it to the same JSON config file [`src/main/settings.ts`](src/main/settings.ts) already used for other app settings, on every add/remove. On the next launch, `PlayerManager.restoreAll()` recreates each player's `WebContentsView` reusing its exact saved id/partition (never a fresh one), so it reattaches the same cookies/localStorage already sitting on disk instead of starting blank.

## Adding a player programmatically

From the renderer (or via the DevTools console pointed at the shell window):

```js
const player = await window.playerSwarm.addPlayer('https://example.com'); // omit url for a blank page
// => { id: 'uuid', url: 'https://example.com', partition: 'persist:player-uuid' }

await window.playerSwarm.removePlayer(player.id); // prompts to optionally purge session data
```

`window.playerSwarm` is the typed API exposed by [`src/preload/index.ts`](src/preload/index.ts) via `contextBridge` — see [`src/shared/types.ts`](src/shared/types.ts) (`PlayerSwarmAPI`) for the full surface.

## Known limits

Implemented: per-player URL bar / back / forward / reload / stop / mute / DevTools button, loading indicator, crash/error card with manual Reload and capped-exponential-backoff auto-relaunch (`PlayerManager`'s `render-process-gone`/`unresponsive`/`did-fail-load` handlers), custom User-Agent (set at creation), rename/label, bulk-add N players (staggered ~150ms apart per `INITPROJECT.md` §6), per-player CPU/memory readout (`app.getAppMetrics()`, polled every 3s), and the global Reload All / Mute All / Remove All ("Close All") actions. Disk persistence of the player list and maximize-to-single-view were already done - see the Session-partition model section above and the maximize ⛶ button on each player card.

Still not built or not fully verified:

- **Per-player "pause" that stops media**, distinct from mute - `INITPROJECT.md` §6 asks for this specifically; muting (`setAudioMuted`) is done, but actually pausing `<video>`/`<audio>` playback would need injecting JS into the guest page (`webContents.executeJavaScript()`), which hasn't been added.
- **GPU hardware-acceleration toggle** is implemented (`app.disableHardwareAcceleration()`, gated on a persisted setting read before `app.whenReady()`), but toggling it triggers a full app relaunch (`app.relaunch()` + `app.exit()`) - not yet tested end-to-end that the relaunch actually round-trips correctly.
- **`npm run build` has not been run against any of this session's changes** - only `npm run dev` has been exercised. Production Angular AOT + Tailwind's purge step are unverified risk areas, not a formality to skip.
- **Memory numbers below are stale** - measured before the Angular/Tailwind/Component Pantry migration and everything built since. Needs re-measurement at 1/5/10 players per `INITPROJECT.md` §9's acceptance test before trusting the budget in §6.
- The acceptance test in `INITPROJECT.md` §9 has not been re-run end-to-end since crash recovery (#3) and label-survives-restart (#4) landed.

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
