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
        'pln-gradient-01': [
          'linear-gradient(71.47deg, #427DFF 8.43%, #44D5BB 87.45%)',
        ],
        'pln-gradient-02': [
          'linear-gradient(to right,rgba(66,125,255,0),rgba(66,125,255,1),rgba(68,213,187,1),rgba(68,213,187,0))',
        ],
      },
      boxShadow: {
        'on-focus': ['0 0 0 2px rgba(21,111,247,0.25)'],
        'on-hover': [
          '0 4px 4px 0 rgba(15,23,42,0.04)',
          '0 0 1px 0 rgba(15,23,42,0.12)',
          '0 0 0 2px rgba(21,111,247,0.25)',
        ],
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
        'pln-shadow-01': ['0px 12px 36px -6px rgba(15, 23, 42, 0.16)'],
        'pln-shadow-01--focus': [
          '0px 0px 0px 2px rgba(21, 111, 247, 0.25)',
          '0px 1px 1px rgba(15, 23, 42, 0.08)',
        ],
      },
      colors: {
        blue: {
          600: '#156FF7',
        },
      },
      fontSize: {
        base: ['15px', '24px'],
      },
      lineHeight: {
        3.5: '14px',
      },
      spacing: {
        6.5: '26px',
        7.5: '30px',
        18: '72px',
        sidebar: '291px',
      },
      strokeWidth: {
        1.5: '1.5px',
      },
    },
  },
  plugins: [require('@tailwindcss/line-clamp')],
};
