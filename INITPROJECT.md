# Pre-Prompt: Multi-Instance Browser Wrapper

You are building a desktop application that acts as a **wrapper hosting multiple independent Chromium browser instances inside a single window**. Read this entire brief before writing code. Follow it exactly; ask before deviating from the stack or architecture.

---

## 1. Product goal

A single desktop app window with an **"Add Player"** button. Each click spawns a new, fully independent embedded Chromium instance ("player") inside the app's grid. The user can add ~10+ players and each behaves like its own separate browser: its own page, its own cookies, its own localStorage, its own devtools.

This is a **generic multi-browser wrapper**. There is no domain-specific logic, no signage integration, no automation, no bot behavior. Each player just loads whatever URL the user gives it.

## 2. Stack (do not substitute without asking)

- **Electron** (latest stable) — the app _is_ Chromium, so we embed rather than spawn external browsers.
- **TypeScript** for both main and renderer processes.
- **Vite** for renderer bundling; `electron-builder` for packaging.
- No heavy UI framework required. Vanilla TS + CSS Grid is preferred for the shell. If a framework genuinely helps, React is acceptable — ask first.
- Persistence: a simple JSON config file in `app.getPath('userData')`. No database.

## 3. Core architecture requirements

**Each player must be a real, isolated Chromium instance.**

- Use `<webview>` tags in the renderer, or `WebContentsView` attached from the main process. Pick one, justify the choice in the README, and be consistent. (`BrowserView` is deprecated — do not use it.)
- **Every player gets its own session partition**, e.g. `partition: "persist:player-<uuid>"`. This is non-negotiable: without it all players share one cookie jar and clobber each other's sessions. Isolation is the entire point of the app.
- Player IDs are stable UUIDs generated at creation and persisted, so a player's session survives app restarts.
- Security defaults stay on: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for guest content. All main↔renderer communication goes through a typed `contextBridge` preload API — never expose `ipcRenderer` or Node primitives directly to the page.
- Never load remote content into the app shell itself. Remote content lives only inside player webviews.

## 4. Features (build in this order)

### Phase 1 — core

1. App shell window with a toolbar and a player grid area.
2. **Add Player** button → prompts for a URL (default to a blank/new-tab page if empty) → creates a player with a fresh partition and renders it in the grid.
3. **Remove Player** (per player) → destroys the instance and releases its resources. Ask whether to also purge its session data.
4. Grid auto-layout: 1 player fills the area; N players tile into a responsive CSS Grid (1→1x1, 2→2x1, 3-4→2x2, 5-6→3x2, 7-9→3x3, 10-12→4x3). Manual column-count override in the toolbar.

### Phase 2 — per-player controls

Each player has a compact header bar with:

- Editable URL bar (shows current URL, Enter navigates)
- Back / Forward / Reload / Stop
- Mute toggle (`setAudioMuted`)
- Open DevTools for that player
- Loading indicator and error state
- Close player

### Phase 3 — resilience & persistence

- **Crash watchdog**: listen for `render-process-gone`, `crashed`, `unresponsive`, `did-fail-load`. Show an inline error card with a Reload button, and support optional auto-relaunch with exponential backoff (cap the retries — never loop infinitely).
- **Persist layout**: save player list (id, url, label, muted, partition) to the config file on change; restore the full grid on next launch.
- Per-player custom User-Agent string (optional field, empty = default).
- Rename/label a player.

### Phase 4 — polish

- Maximize/focus a single player (double-click header) with a way back to grid view.
- "Add N players" bulk action.
- Simple memory/CPU readout per player using `app.getAppMetrics()` mapped by `webContents` process ID.
- Global actions: Reload All, Mute All, Close All.

## 5. Explicit non-goals

Do not build any of the following unless asked later:

- Automation, scripted clicking, auto-login, credential storage, or CDP/Playwright control
- Proxy-per-instance, fingerprint spoofing beyond a plain UA field, or anti-detection features
- Account management, multi-login orchestration, or any signage/CMS integration
- Cloud sync, telemetry, or analytics
- Extension support

## 6. Performance constraints — design for these from the start

- Budget roughly **150–350 MB RAM per player** at idle; more with video. Ten players is the design target; the app must not fall over at 12.
- Concurrent video decode is the real bottleneck. Chromium falls back to software decode after a handful of hardware-accelerated streams. Provide a settings toggle for `--disable-gpu` / hardware acceleration so the user can experiment.
- **Suspend offscreen players.** Players scrolled out of view or in a collapsed state should be throttled, not silently burning CPU. Use `webContents.setBackgroundThrottling(true)` and expose a per-player "pause" that stops media.
- Creating 10 players must not block the UI thread — stagger instantiation (e.g. ~150 ms apart) and show placeholders immediately.
- Destroying a player must actually free memory. Verify: add 10, remove 10, confirm RSS returns near baseline. Report the numbers.

## 7. Code conventions

- Strict TypeScript (`strict: true`). No `any` in committed code.
- Shared types for IPC payloads in a `shared/` directory, imported by both main and renderer.
- Single source of truth for player state in the main process; the renderer reflects it. Do not duplicate mutable state on both sides.
- Small, focused modules: `main/playerManager.ts`, `main/store.ts`, `renderer/grid.ts`, `renderer/playerCard.ts`, `preload/api.ts`.
- Clean up every listener when a player is destroyed. Leaked `webContents` listeners are the most likely source of memory growth here.
- Meaningful commits; no commented-out code left behind.

## 8. Deliverables

1. Runnable project — `npm install && npm run dev` starts the app.
2. `README.md` covering: architecture decision (`<webview>` vs `WebContentsView`) and why, the session-partition model, how to add a player programmatically, known limits, and measured memory numbers at 1 / 5 / 10 players.
3. `npm run build` producing a packaged app for the current platform via `electron-builder`.

## 9. Acceptance test — the app is done when this passes

1. Launch the app. Click **Add Player** 10 times with 10 different URLs. All 10 render simultaneously in a readable grid.
2. Log into the same site in player 1 and player 2 as different accounts. Both stay logged in independently. Reloading one does not affect the other.
3. Kill one player's renderer process from the OS. That player shows an error card and recovers on Reload; the other 9 are unaffected.
4. Close the app and reopen it. All 10 players return with their URLs, labels, and sessions intact.
5. Remove all 10 players. Memory returns to roughly the baseline from step 0.

## 10. Working method

Work in phases. After each phase, stop and report: what was built, how you verified it, and anything in this brief that turned out to be wrong or impractical. Do not silently work around a constraint — surface it. If a requirement conflicts with another, ask rather than guessing.
