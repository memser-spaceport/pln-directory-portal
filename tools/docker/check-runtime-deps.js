/**
 * Verifies that every external package required by a webpack bundle
 * (`externalDependencies: "all"` in apps/web-api/project.json) can be resolved
 * from the current directory. Run inside the runtime Docker stage so a missing
 * production dependency fails the image build instead of the pod start.
 *
 * Usage: node check-runtime-deps.js <bundle.js>
 */
const fs = require('fs');
const path = require('path');

const bundle = process.argv[2];
if (!bundle) {
  console.error('usage: node check-runtime-deps.js <bundle.js>');
  process.exit(2);
}

const source = fs.readFileSync(bundle, 'utf8');
const specifiers = new Set();
// Relative and absolute paths are bundled; everything else is an external
// package (including `.prisma/oso-client`, which lives in node_modules).
for (const match of source.matchAll(/\brequire\(\s*["']((?!\.{0,2}\/)[^"']+)["']\s*\)/g)) {
  specifiers.add(match[1]);
}

const builtin = new Set(require('module').builtinModules);
const resolveFrom = path.resolve(process.cwd());
const missing = [];
let checked = 0;

for (const specifier of [...specifiers].sort()) {
  const name = specifier.replace(/^node:/, '');
  if (builtin.has(name) || builtin.has(name.split('/')[0])) continue;
  checked += 1;
  try {
    require.resolve(specifier, { paths: [resolveFrom] });
  } catch (error) {
    missing.push(`${specifier} (${error.code || error.message})`);
  }
}

if (missing.length) {
  console.error(`Missing runtime dependencies required by ${bundle}:`);
  for (const entry of missing) console.error(`  - ${entry}`);
  process.exit(1);
}

console.log(`OK: ${checked} external packages required by ${bundle} resolve from ${resolveFrom}`);
