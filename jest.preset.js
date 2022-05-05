const nxPreset = require('@nrwl/jest/preset');

module.exports = {
  ...nxPreset,
  moduleNameMapper: {
    '\\.svg': './__mocks__/svgr-mock.js',
  },
  setupFiles: ['./.jest/setup-env.ts'],
};
