// Customizes the Nx (@nrwl/node:webpack) config for `web-api`.
//
// We drop ForkTsCheckerWebpackPlugin (the forked type-checker worker). On this
// project's type graph that worker reliably crashes — either heap OOM
// ("Reached heap limit") or "Maximum call stack size exceeded" — because the
// plugin hardcodes the worker's execArgv to only `--max-old-space-size` and
// gives it no way to raise the V8 stack size. The crash is non-fatal (webpack
// still compiles), so the worker was producing scary log noise without ever
// completing a type-check.
//
// Type-checking is still done by the editor's TS server and via the
// `npm run typecheck:api` script (`tsc --noEmit` with a larger stack).
//
// Note: the main webpack process still runs the @nestjs/swagger transformer,
// which needs a larger V8 stack — launch serve/build with the node flags in the
// `start:api` npm script (`--stack-size` + `--max-old-space-size`).
module.exports = (config) => {
  config.plugins = (config.plugins || []).filter(
    (plugin) => plugin?.constructor?.name !== 'ForkTsCheckerWebpackPlugin'
  );
  return config;
};
