# Compact menus

The player card's right-click and `⋮` menu uses a separate, sandboxed Electron child window. `⋮` is shown at every card size, and **Open DevTools** is reached only through this menu (the card header has an Instance Console button instead). The toolbar's **Actions**, **Remove**, **Layout** and **Settings** menus open in the same popup window with the same styling (`toolbarMenu.ts` builds their items). They are 184px wide, have no URL row, and are exactly as tall as their items. Checkboxes show ✓ and radio choices show ●. The popup has no submenus, so Layout lists **Columns** and **Per page** as labelled sections, each ending in **Custom…**. Long labels, such as the Docker repository folder, are ellipsized with the full text in a tooltip. Clicking a toolbar button while its menu is open closes the menu. Chosen items send the same `{kind, action, value}` event the native menus did. Player content remains in its existing WebContentsViews; the popup does not hide, resize, or reorder those views.

The menu is 168 × 220 device-independent pixels with 18px action rows, a 17px monospace URL row, 11px action text, 3px outer padding, three 1px separators and a 6px corner radius. The popup window is transparent and frameless so the rounded corners are drawn in CSS. It reuses the renderer's existing dark colors and fonts. Long text stays on one line with ellipsis. Hovering the URL shows the full URL/name, and clicking it copies the original URL. The existing action order, checked states, enabled states and renderer callbacks are retained.

## Placement and dismissal

Right-click requests carry the pointer's CSS viewport position. Overflow-button requests also carry the button rectangle. Main converts those coordinates using the parent window's content origin and renderer zoom factor. Electron's screen/window coordinates are already DIPs, so monitor DPI scaling is not applied twice.

The popup uses the work area of the display nearest the anchor. It normally appears at the cursor or 2px below the button, flips left/up when necessary, and is clamped with a 4px work-area margin. Negative monitor origins are supported. On unusually small work areas the menu shrinks and scrolls rather than going offscreen.

Escape, Tab, choosing an action, outside focus, parent movement/resizing/minimizing, player removal, and display changes dismiss it. Focus transferring from parent to popup is expected and does not dismiss it. Arrow keys, Home/End, type-to-select, Enter and Space are supported. The popup is reused between openings and destroyed when the parent closes.

The restricted preload exposes initial menu data, readiness, action selection and dismissal. Main validates the exact popup sender/main frame, current opening token, selected player's continued existence and whether the action is enabled. Existing actions return through the existing `ui:toolbar-menu-action` event. There is no arbitrary command, player ID, or generic IPC API in the popup.

## Checks

From `desktop/`:

```powershell
npm run typecheck
npm run test:player-menu
npm run test:player-menu:electron
```

The unit tests cover normal/overflow positions, button anchors, renderer zoom, negative monitor origins, small work areas and action states. The Electron test uses an isolated temporary window and guest view, without loading real players or accessing Docker. It checks actual dimensions, URL copying, action dispatch, keyboard navigation, dismissal, stale/foreign requests, removal and unchanged guest bounds. It saves a preview under `release/player-menu-qa.png`.

Mixed-DPI and negative-monitor placement are covered by coordinate tests; visual checks on additional physical monitor configurations remain useful when available.
