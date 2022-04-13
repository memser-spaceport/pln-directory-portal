module.exports = {
  displayName: 'web-app',
  preset: '../../jest.preset.js',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nrwl/react/plugins/jest',
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nrwl/next/babel'] }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/apps/web-app',
  /**
   * Enable `@testing-library/jest-dom` matchers.
   *
   * @see https://jestjs.io/docs/configuration#setupfilesafterenv-array
   */
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
