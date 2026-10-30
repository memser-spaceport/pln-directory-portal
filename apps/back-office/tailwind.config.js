const { join } = require('path');

module.exports = {
  presets: [require('../../tailwind-workspace-preset.js')],
  content: [
    join(__dirname, '**/*.{js,ts,jsx,tsx}'),
    join(__dirname, 'pages/**/*.{js,ts,jsx,tsx}'),
    join(__dirname, 'components/**/*.{js,ts,jsx,tsx}'),
    join(__dirname, 'layouts/**/*.{js,ts,jsx,tsx}'),
    join(__dirname, '../../libs/ui/src/**/*.{js,ts,jsx,tsx}'),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
