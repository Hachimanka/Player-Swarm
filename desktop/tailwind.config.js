/** @type {import('tailwindcss').Config} */
module.exports = {
    presets: [require('@ntv360/component-pantry/tailwind-preset.js')],
    darkMode: 'class',
    content: ['./src/renderer/**/*.{html,ts}', './node_modules/@ntv360/component-pantry/**/*.{mjs,css}'],
    theme: {
        extend: {},
    },
    plugins: [],
};
