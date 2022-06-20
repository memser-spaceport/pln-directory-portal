module.exports = {
  theme: {
    extend: {
      boxShadow: {
        'special-button-default': [
          '0px 1px 1px rgba(7, 8, 8, 0.16)',
          'inset 0px 1px 0px rgba(255, 255, 255, 0.16)',
        ],
        'special-button-hover': [
          '0px 0px 0px 2px rgba(21, 111, 247, 0.25)',
          '0px 1px 1px rgba(7, 8, 8, 0.16)',
          'inset 0px 1px 0px rgba(255, 255, 255, 0.16)',
        ],
        'special-button-focus': [
          'inset 0 0 0 1px #FFFFFF',
          '0px 0px 0px 2px rgba(21, 111, 247, 0.25)',
          '0px 1px 1px rgba(7, 8, 8, 0.16)',
          'inset 0px 1px 0px rgba(255, 255, 255, 0.16)',
        ],
      },
    },
  },
  plugins: [require('@tailwindcss/line-clamp')],
};
