import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

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
                input: resolve('src/preload/index.ts'),
            },
        },
    },
    renderer: {
        root: resolve('src/renderer'),
        resolve: {
            alias: {
                '@shared': resolve('src/shared'),
            },
        },
        build: {
            rollupOptions: {
                input: resolve('src/renderer/index.html'),
            },
        },
    },
});
