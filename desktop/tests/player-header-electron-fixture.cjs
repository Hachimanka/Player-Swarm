// Runs the real built app against temporary settings; see player-header-electron.cjs.
const { app } = require('electron');
const { resolve } = require('node:path');
app.setPath('userData', process.env.HEADER_QA_DATA);
require(resolve(__dirname, '../out/main/index.js'));
