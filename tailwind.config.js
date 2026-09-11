/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'media',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        surface: {
          base: '#FAFAF9',
          baseDark: '#171412',
          raised: '#FFFFFF',
          raisedDark: '#211D1A',
        },
        ink: {
          primary: '#1C1917',
          primaryDark: '#F5F3F1',
          secondary: '#78716C',
          secondaryDark: '#A39C93',
          disabled: '#A8A29E',
          disabledDark: '#6B6560',
        },
        border: {
          hairline: '#E7E5E4',
          hairlineDark: '#332E29',
        },
        destructive: '#DC2626',
        destructiveDark: '#F87171',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
      },
      spacing: {
        gutter: '16px',
      },
    },
  },
  plugins: [],
};
