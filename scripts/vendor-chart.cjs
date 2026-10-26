'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = path.join(root, 'node_modules/chart.js');
fs.mkdirSync(path.join(root, 'vendor'), { recursive: true });
// Committed assets support buildless GitHub Pages and the strict same-origin CSP.
fs.copyFileSync(path.join(source, 'dist/chart.umd.js'), path.join(root, 'vendor/chart.umd.js'));
fs.copyFileSync(path.join(source, 'LICENSE.md'), path.join(root, 'vendor/Chart.js.LICENSE.md'));
console.log('Copied pinned Chart.js UMD bundle and license to vendor/');
