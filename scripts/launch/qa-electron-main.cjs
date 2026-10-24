// Copied into QA packages only, never included by the release file list.
const { app } = require('electron');
const path = require('node:path');
// ESM_QA_USER_DATA points a test run at a throwaway profile, leaving the tester's QA profile alone.
app.setPath('userData', process.env.ESM_QA_USER_DATA ? path.resolve(process.env.ESM_QA_USER_DATA) : path.join(app.getPath('appData'), 'EsportsManager-Local-QA'));
require('./main.js');
