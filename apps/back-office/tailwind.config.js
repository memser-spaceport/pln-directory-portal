const { join } = require('path');
const { createGlobPatternsForDependencies } = require('@nrwl/next/tailwind');

module.exports = {
  presets: [require('../../tailwind-workspace-preset.js')],
  content: [
    join(__dirname, '**/*.{js,ts,jsx,tsx}'),
    join(__dirname, 'pages/**/*.{js,ts,jsx,tsx}'),
    join(__dirname, 'components/**/*.{js,ts,jsx,tsx}'),
    join(__dirname, 'layouts/**/*.{js,ts,jsx,tsx}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
