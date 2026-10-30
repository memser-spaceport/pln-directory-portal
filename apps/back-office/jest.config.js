// next/jest compiles tests with Next's SWC transformer and the app's next.config.js.
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: __dirname });

module.exports = createJestConfig({
  displayName: 'back-office',
  preset: '../../jest.preset.js',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nrwl/react/plugins/jest',
  },
  // Same key as next/jest's own .svg rule, so it replaces that rule: SVGs are imported as `{ ReactComponent }`.
  moduleNameMapper: {
    '^.+\\.(svg)$': require.resolve('../../__mocks__/svgr-mock.js'),
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/apps/back-office',
});
