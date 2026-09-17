const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const filename = resolve(__dirname, '../src/main/playerMenuModel.ts');
const mod = new Module(filename, module);
mod._compile(buildSync({ entryPoints: [filename], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text, filename);
const { playerMenuBounds, screenAnchor, playerMenuItems } = mod.exports;

test('right-click anchors stay in DIPs, including window offset and renderer zoom', () => {
    const content = { x: -1500, y: 120, width: 1100, height: 700 };
    assert.deepEqual(screenAnchor({ x: 200, y: 80 }, content, 1.25), { x: -1250, y: 220, width: 0, height: 0 });
    assert.deepEqual(screenAnchor({ x: 20, y: 40, anchor: { x: 20, y: 10, width: 24, height: 30 } }, content, 1.5),
        { x: -1470, y: 135, width: 36, height: 45 });
    assert.throws(() => screenAnchor({ x: NaN, y: 2 }, content, 1), /Invalid/);
});

test('normal pointer and button positions preserve the anchor', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 };
    assert.deepEqual(playerMenuBounds({ x: 300, y: 200, width: 0, height: 0 }, area),
        { x: 300, y: 200, width: 168, height: 220 });
    assert.deepEqual(playerMenuBounds({ x: 300, y: 200, width: 24, height: 26 }, area),
        { x: 300, y: 228, width: 168, height: 220 });
});

test('overflow flips left and above the button, staying clear of taskbar', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 };
    assert.deepEqual(playerMenuBounds({ x: 1880, y: 980, width: 24, height: 26 }, area),
        { x: 1736, y: 758, width: 168, height: 220 });
});

test('all corners, negative monitor origins, offscreen anchors and small work areas remain contained', () => {
    for (const area of [{ x: -1920, y: -300, width: 1920, height: 1040 },
        { x: 0, y: 0, width: 1280, height: 680 }, { x: 500, y: -900, width: 160, height: 180 }]) {
        for (const x of [area.x - 100, area.x, area.x + area.width, area.x + area.width + 100]) {
            for (const y of [area.y - 100, area.y, area.y + area.height, area.y + area.height + 100]) {
                const bounds = playerMenuBounds({ x, y, width: 24, height: 28 }, area);
                assert.ok(bounds.x >= area.x + 4 && bounds.y >= area.y + 4);
                assert.ok(bounds.x + bounds.width <= area.x + area.width - 4);
                assert.ok(bounds.y + bounds.height <= area.y + area.height - 4);
            }
        }
    }
});

test('all existing actions, ordering, checked and enabled states survive every menu state', () => {
    for (const flag of [false, true]) {
        const items = playerMenuItems({ focused: flag, selected: flag, muted: flag, loading: flag,
            canGoBack: flag, canGoForward: flag, hasInstance: flag });
        assert.deepEqual(items.map((i) => i.action), ['toggleFocus', 'toggleSelect', 'goBack', 'goForward',
            flag ? 'stop' : 'reload', 'toggleMute', 'rename', 'openDevTools', 'openInstanceConsole', 'remove']);
        assert.equal(items[1].checked, flag); assert.equal(items[5].checked, flag);
        assert.equal(items[2].enabled, flag); assert.equal(items[3].enabled, flag); assert.equal(items[8].enabled, flag);
        assert.equal(items.filter((i) => i.separatorBefore).length, 3);
        assert.equal(items[9].destructive, true);
    }
});

const load = (path) => {
    const file = resolve(__dirname, path);
    const loaded = new Module(file, module);
    loaded._compile(buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text, file);
    return loaded.exports;
};
const { toolbarMenuItems } = load('../src/main/toolbarMenu.ts');
const { menuItemKey } = load('../src/shared/playerMenu.ts');
const { menuHeight, PLAYER_MENU_HEIGHT } = mod.exports;

test('menu height matches the CSS rows, including the player name row', () => {
    assert.equal(menuHeight(playerMenuItems({ hasInstance: true }), true), PLAYER_MENU_HEIGHT);
    assert.equal(menuHeight(toolbarMenuItems('remove', { selectedCount: 0, totalCount: 3 }), false), 8 + 18 + 18 + 5);
});

test('toolbar menus keep their existing actions, states and values', () => {
    const actions = toolbarMenuItems('actions', { allMuted: true, totalCount: 4, selectedCount: 4 });
    assert.deepEqual(actions.map((i) => [i.action, i.enabled, i.checked]), [
        ['reloadAll', true, undefined], ['toggleMuteAll', true, true], ['selectAll', false, undefined], ['clearSelection', true, undefined]]);
    assert.equal(actions[2].label, 'Select all (4)');

    const remove = toolbarMenuItems('remove', { selectedCount: 0, totalCount: 2 });
    assert.deepEqual(remove.map((i) => [i.label, i.enabled]), [['Remove selected (0)', false], ['Remove all players (2)', true]]);

    const settings = toolbarMenuItems('settings', { gpuDisabled: true, dockerRepoLabel: 'player-swarm-docker' });
    assert.deepEqual(settings.map((i) => [i.action, i.checked, i.label]), [
        ['toggleGpu', false, 'GPU acceleration'], ['chooseDockerRepoPath', undefined, 'Docker repository: player-swarm-docker']]);

    const layout = toolbarMenuItems('layout', { columns: 3, pageSize: null });
    assert.deepEqual(layout.map((i) => i.label), ['Layout']);
    const groups = layout[0].submenu;
    assert.deepEqual(groups.map((i) => i.label), ['Columns', 'Per page']);
    const leaves = groups.flatMap((i) => i.submenu);
    assert.deepEqual(leaves.filter((i) => i.checked).map((i) => menuItemKey(i)), ['setColumns:3', 'setPageSize:auto']);
    const keys = leaves.map(menuItemKey);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(keys.includes('customColumns') && keys.includes('customPageSize') && keys.includes('setColumns:auto') && keys.includes('setPageSize:20'));
});

test('Layout preserves every preset, Auto and Custom with only one visible root row', () => {
    const layout = toolbarMenuItems('layout', { columns: 7, pageSize: 15 });
    assert.equal(menuHeight(layout, false), 26);
    const groups = layout[0].submenu;
    assert.equal(menuHeight(groups, false), 44);
    assert.deepEqual(groups[0].submenu.slice(0, -1).map((i) => i.value), [null, 1, 2, 3, 4, 5, 6, 8]);
    assert.deepEqual(groups[1].submenu.slice(0, -1).map((i) => i.value), [null, 1, 2, 4, 6, 9, 12, 20]);
    for (const group of groups) {
        assert.equal(menuHeight(group.submenu, false), 170);
        assert.deepEqual(group.submenu.filter((i) => i.checked).map((i) => i.label), ['Custom…']);
        assert.equal(group.submenu.at(-1).value, undefined);
    }
    for (const [index, property] of [[0, 'columns'], [1, 'pageSize']]) {
        for (const choice of groups[index].submenu.slice(0, -1)) {
            const items = toolbarMenuItems('layout', { [property]: choice.value })[0].submenu[index].submenu;
            assert.deepEqual(items.filter((i) => i.checked).map((i) => i.value), [choice.value]);
        }
    }
});

test('submenus align to rows, flip at screen edges and retain left-opening direction', () => {
    const { submenuBounds } = mod.exports;
    const area = { x: 0, y: 0, width: 1000, height: 800 };
    const size = { width: 132, height: 170 };
    assert.deepEqual(submenuBounds({ x: 200, y: 104, width: 132, height: 18 }, area, size),
        { x: 332, y: 100, ...size });
    assert.deepEqual(submenuBounds({ x: 850, y: 704, width: 132, height: 18 }, area, size),
        { x: 718, y: 626, ...size });
    assert.equal(submenuBounds({ x: 718, y: 104, width: 132, height: 18 }, area, size, true).x, 586);
    for (const workArea of [area, { x: -1200, y: -100, width: 1200, height: 700 }, { x: 10, y: 10, width: 100, height: 100 }]) {
        for (const x of [workArea.x - 100, workArea.x, workArea.x + workArea.width]) {
            for (const y of [workArea.y, workArea.y + workArea.height]) {
                const bounds = submenuBounds({ x, y, width: 132, height: 18 }, workArea, size);
                assert.ok(bounds.x >= workArea.x + 4 && bounds.y >= workArea.y + 4);
                assert.ok(bounds.x + bounds.width <= workArea.x + workArea.width - 4);
                assert.ok(bounds.y + bounds.height <= workArea.y + workArea.height - 4);
            }
        }
    }
});
