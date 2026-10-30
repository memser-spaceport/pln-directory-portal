// Completes the production build in dist/apps/back-office so `next start dist/apps/back-office` can serve it:
// `next build` writes only `.next` there, so this copies `public/` and `next.config.js` next to it and adds a
// package.json that names the framework versions the build used.
const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const workspaceRoot = path.join(appRoot, '..', '..');
const outDir = path.join(workspaceRoot, 'dist', 'apps', 'back-office');

fs.rmSync(path.join(outDir, 'public'), { recursive: true, force: true });
fs.cpSync(path.join(appRoot, 'public'), path.join(outDir, 'public'), { recursive: true });
fs.copyFileSync(path.join(appRoot, 'next.config.js'), path.join(outDir, 'next.config.js'));

const { devDependencies } = require(path.join(workspaceRoot, 'package.json'));
const dependencies = Object.fromEntries(['next', 'react', 'react-dom'].map((name) => [name, devDependencies[name]]));
fs.writeFileSync(
  path.join(outDir, 'package.json'),
  JSON.stringify({ name: 'back-office', version: '0.0.1', private: true, dependencies }, null, 2) + '\n'
);
