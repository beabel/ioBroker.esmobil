const path = require('path');
const { tests } = require('@iobroker/testing');

// Prüft, dass package.json und io-package.json konsistent sind (Standardtest aus dem
// offiziellen ioBroker-Adapter-Template).
tests.packageFiles(path.join(__dirname, '..', '..'));
