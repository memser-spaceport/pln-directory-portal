module.exports = {
  displayName: 'ui',
  preset: '../../jest.preset.js',
  transform: {
    '^.+\\.[tj]sx?$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/libs/ui',
  /**
   * Enable `@testing-library/jest-dom` matchers.
   *
   * @see https://jestjs.io/docs/configuration#setupfilesafterenv-array
   */
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
