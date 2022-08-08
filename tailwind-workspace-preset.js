module.exports = {
  theme: {
    extend: {
      backgroundImage: {
        ask_to_edit_card: "url('../public/assets/images/ask-to-edit-bg.png')",
        'gradient-to-b--white-to-slate-200': [
          'linear-gradient(180deg, #FFFFFF 0%, #E2E8F0 205.47%)',
        ],
        'gradient-to-r--white-to-slate-200': [
          'linear-gradient(90deg, #FFFFFF 0%, #E2E8F0 231.25%)',
        ],
      },
      boxShadow: {
        'card--slate-900': [
          '0px 0px 1px rgba(15, 23, 42, 0.12)',
          '0px 4px 4px rgba(15, 23, 42, 0.04)',
        ],
        'request-button': ['0px 1px 1px rgba(15, 23, 42, 0.08)'],
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
      colors: {
        blue: {
          600: '#156FF7',
        },
      },
      fontSize: {
        base: '15px',
      },
      spacing: {
        7.5: '30px',
      },
    },
  },
  plugins: [require('@tailwindcss/line-clamp')],
};
