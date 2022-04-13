const nxPreset = require('@nrwl/jest/preset');

module.exports = {
  ...nxPreset,
  moduleNameMapper: {
    '\\.svg': './__mocks__/svgrMock.js',
  },
};
