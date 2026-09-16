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
        { x: 300, y: 200, width: 200, height: 233 });
    assert.deepEqual(playerMenuBounds({ x: 300, y: 200, width: 24, height: 26 }, area),
        { x: 300, y: 228, width: 200, height: 233 });
});

test('overflow flips left and above the button, staying clear of taskbar', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 };
    assert.deepEqual(playerMenuBounds({ x: 1880, y: 980, width: 24, height: 26 }, area),
        { x: 1704, y: 745, width: 200, height: 233 });
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
