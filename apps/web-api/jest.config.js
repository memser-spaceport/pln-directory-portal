module.exports = {
  displayName: 'web-api',
  preset: '../../jest.preset.js',
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.spec.json',
    },
  },
  testEnvironment: 'node',
  // Temporary fix for CI/CD issue: https://d.pr/i/x1Qfk7
  testTimeout: 30000,
  transform: {
    '^.+\\.[tj]s$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api',
  setupFilesAfterEnv: ['./mocks.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(web3.storage|ipfs-car|@web3-storage|carbites)/)',
  ],
};
