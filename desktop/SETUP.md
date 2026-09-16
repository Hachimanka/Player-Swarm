# Setting up Player Swarm (desktop)

How to get the Electron + Angular desktop app installed and running on a fresh machine. For what the app is and how it works, see [`README.md`](README.md).

## Quick start

Already have Node 24 and repo access? Run this from the repo root in PowerShell:

```powershell
cd desktop
nvs use 24                                   # or: nvm use 24
Copy-Item ..\.npmrc .\.npmrc                 # private registry config for @ntv360
npm install
node node_modules\electron\install.js        # download the Electron binary
npm run dev
```

The Player Swarm window opens. If any step fails, follow the full steps below or jump to [Troubleshooting](#7-troubleshooting).

---

## 1. Install Node 24

| Tool | Version            | Check with      |
| ---- | ------------------ | --------------- |
| Node | **24** or newer    | `node -v`       |
| npm  | ships with Node 24 | `npm -v`        |
| Git  | any recent         | `git --version` |

`package.json` requires `"node": ">=24.0.0"`, and the `.npmrc` sets `engine-strict=true`, so on Node 22 or older `npm install` fails with `EBADENGINE`.

**With [nvs](https://github.com/jasongin/nvs)** (Windows):

```powershell
nvs add 24      # download Node 24 (once)
nvs use 24      # use it in this terminal
nvs link 24     # optional: make it the default for new terminals
node -v         # should print v24.x.x
```

> Use `nvs use 24`, not `nvs use lts`. The `lts` alias can point to an older release such as Node 22.

**With nvm:** the repo root has an `.nvmrc` pinned to `24`:

```bash
nvm install
nvm use
```

## 2. Configure the private npm registry

`@ntv360/component-pantry` is hosted on the NCompassTV private registry (`https://npm-dev.n-compass.online/`), not on npmjs.org.

`desktop/` has its own `package.json`, so npm treats it as its own project and does **not** read the repo-root `.npmrc`. Copy the root config into `desktop/`:

```powershell
# from Player-Swarm\desktop
Copy-Item ..\.npmrc .\.npmrc
```

It contains:

```ini
engine-strict=true
registry=https://registry.npmjs.org/
@ntv360:registry=https://npm-dev.n-compass.online/
//npm-dev.n-compass.online/:_authToken=<BASE64_TOKEN>
```

The token is the base64 encoding of `username:password` for the private registry. If you need to make your own:

```powershell
# PowerShell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("username:password"))
```

```bash
# macOS / Linux / Git Bash
printf 'username:password' | base64
```

Check that it works:

```powershell
npm view @ntv360/component-pantry version
```

It should print a version number (for example `0.7.10`). A `404` means npm is still looking at npmjs.org, so `desktop/.npmrc` is missing. A `401` means the token is wrong.

## 3. Install dependencies

```powershell
npm install
```

A successful install ends with `added ... packages` and `found 0 vulnerabilities`. You can ignore these warnings:

- **`npm warn deprecated ...`** (`rimraf`, `inflight`, `glob`, `boolean`) come from packages your dependencies use, not from this project.
- **`npm warn install-scripts ... not yet covered by allowScripts`**: npm skipped some packages' setup scripts. `npm run dev` works without them. If you later hit build errors, see [Troubleshooting](#7-troubleshooting).

### Dependency versions must match Component Pantry

`@ntv360/component-pantry` does **not** bundle its chart and animation libraries. The app installs them as peer dependencies, per the [Component Pantry installation docs](https://strapi-xi-smoky.vercel.app/overview/installation). Their versions must be ones the pantry accepts, or `npm install` fails with `ERESOLVE`.

Ranges as of `@ntv360/component-pantry@0.7.10` (check with `npm view @ntv360/component-pantry peerDependencies`):

| Package                            | Pantry accepts | Use in `package.json` |
| ---------------------------------- | -------------- | --------------------- |
| `@angular/core` / `common` / `cdk` | `^21 \|\| ^22` | `"^22.x"`             |
| `tailwindcss`                      | `^3.0.0`       | `"^3.4.19"`           |
| `apexcharts`                       | `^5.10.4`      | `"^5.10.4"`           |
| `ng-apexcharts`                    | `^2.3.0`       | `"^2.5.0"`            |
| `lottie-web`                       | `^5.13.0`      | `"^5.13.0"`           |
| `ngx-lottie`                       | `^20.0.0`      | `"^20.0.0"`           |
| `@lottiefiles/lottie-player`       | `^2.0.0`       | `"^2.0.12"`           |

Don't bump these to their latest major versions (for example `apexcharts@7`, `ng-apexcharts@3` or `ngx-lottie@22`). Only raise them after the pantry releases a version that accepts the newer ranges.

## 4. Download the Electron binary

Electron 43 no longer downloads its binary during `npm install`; it downloads it the first time something runs it. `electron-vite` checks for the binary without triggering that download and fails with `Error: Electron uninstall`. Download it once:

```powershell
node node_modules\electron\install.js
```

This downloads about 100 MB. Repeat it after every fresh install (whenever you delete `node_modules`).

## 5. Run the app

```powershell
npm run dev
```

You should see `dev server running for the electron renderer process at: http://localhost:5173/`, and then the Player Swarm window opens. Click **Add Player** (or run `window.playerSwarm.addPlayer('https://example.com')` in the shell window's DevTools) to confirm players load.

Stop it with `Ctrl+C`.

## 6. Command reference

| Command                                 | What it does                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `npm install`                           | Install dependencies                                                          |
| `node node_modules\electron\install.js` | Download the Electron binary (after every fresh install)                      |
| `npm run dev`                           | Development build with hot reload and a visible window                        |
| `npm run typecheck`                     | `tsc --noEmit` against the main/preload and renderer configs                  |
| `npm run build`                         | `electron-vite build` + `electron-builder`; the installer goes in `release/`  |

`npm run build` produces the installer for the OS you run it on: NSIS `.exe` on Windows, `.dmg` on macOS, AppImage on Linux.

### Clean reinstall

When dependencies get into a bad state:

```powershell
# PowerShell
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
npm install
node node_modules\electron\install.js
```

```bash
# macOS / Linux / Git Bash
rm -rf node_modules package-lock.json
npm install
node node_modules/electron/install.js
```

## 7. Troubleshooting

**`EBADENGINE` / `Unsupported engine ... Required: {"node":">=24.0.0"}`**
You're on Node 22 or older. Run `nvs use 24` (or `nvm use 24`), check with `node -v`, then run `npm install` again. See [step 1](#1-install-node-24).

**`'electron-vite' is not recognized as an internal or external command`**
`node_modules` is missing or the last `npm install` failed. Fix whatever error `npm install` showed, then run it again.

**`404 Not Found - GET https://registry.npmjs.org/@ntv360%2fcomponent-pantry`**
`desktop/.npmrc` is missing, so npm is looking on the public registry. Copy it from the repo root (see [step 2](#2-configure-the-private-npm-registry)).

**`401 Unauthorized` / `E401` from `npm-dev.n-compass.online`**
The `_authToken` in `.npmrc` is wrong or expired. Regenerate it from the correct `username:password`.

**`ERESOLVE could not resolve ... peerOptional <package>@"..." from @ntv360/component-pantry`**
A package in `package.json` (usually `apexcharts`, `ng-apexcharts` or `ngx-lottie`) is newer than the pantry supports. Set it to the version in the [table above](#dependency-versions-must-match-component-pantry), then do a [clean reinstall](#clean-reinstall). Avoid `--force` and `--legacy-peer-deps`. They hide the conflict instead of fixing it, and pantry components can break at runtime.

**`Error: Electron uninstall` from `npm run dev`**
The Electron binary hasn't been downloaded. Run `node node_modules\electron\install.js`, then `npm run dev` again (see [step 4](#4-download-the-electron-binary)).

**Build errors mentioning `esbuild`, `@parcel/watcher`, `lmdb` or `msgpackr-extract`**
Their install scripts were skipped (the `install-scripts` warning). Approve them and rerun:

```powershell
npm install-scripts approve esbuild
npm install-scripts approve @parcel/watcher
npm install-scripts approve lmdb
npm install-scripts approve msgpackr-extract
npm install-scripts approve electron-winstaller   # needed for `npm run build` on Windows
npm rebuild
```

Leave `@scarf/scarf` unapproved; it only sends usage statistics.

**GPU-process errors on Linux (Wayland)**
Start with `ELECTRON_OZONE_PLATFORM_HINT=x11 npm run dev`. Most Windows and macOS machines don't need this.
