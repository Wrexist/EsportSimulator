// Copied into QA packages only, never included by the release file list.
const { app } = require('electron');
const path = require('node:path');
app.setPath('userData', path.join(app.getPath('appData'), 'EsportsManager-Local-QA'));
require('./main.js');
