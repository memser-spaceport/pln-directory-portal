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
  // nodemailer exposes lib/* only through package.json "exports", which Jest 27 does not read.
  moduleNameMapper: {
    '^nodemailer/lib/mail-composer$': require.resolve('nodemailer/lib/mail-composer'),
    // The Nx resolver picks the "import" condition of nestjs-zod's exports (an ES module Jest cannot run).
    '^nestjs-zod/z$': require.resolve('nestjs-zod/z'),
  },
};
