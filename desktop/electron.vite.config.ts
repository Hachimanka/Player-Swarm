import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        resolve: {
            alias: {
                '@shared': resolve('src/shared'),
            },
        },
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        resolve: {
            alias: {
                '@shared': resolve('src/shared'),
            },
        },
        build: {
            rollupOptions: {
                input: { index: resolve('src/preload/index.ts'), console: resolve('src/preload/console.ts'),
                    'player-menu': resolve('src/preload/player-menu.ts') },
            },
        },
    },
    renderer: {
        root: resolve('src/renderer'),
        plugins: [angular({ tsconfig: resolve('tsconfig.web.json') })],
        resolve: {
            alias: {
                '@shared': resolve('src/shared'),
            },
        },
        build: {
            rollupOptions: {
                input: { index: resolve('src/renderer/index.html'), console: resolve('src/renderer/console.html'),
                    'player-menu': resolve('src/renderer/player-menu.html') },
            },
        },
    },
});
