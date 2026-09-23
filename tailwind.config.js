// Palette mirrors lib/theme/colors.ts token for token (enforced by
// __tests__/themeTokens.test.ts). No accent color -- pure monochrome.
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'media',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        surface: {
          base: '#F6F4EE',
          baseDark: '#1A1816',
          raised: '#FFFDF8',
          raisedDark: '#24211E',
          tile: '#ECE8DF',
          tileDark: '#2A2622',
        },
        ink: {
          primary: '#252220',
          primaryDark: '#EDE8DF',
          secondary: '#766E64',
          secondaryDark: '#A39B90',
          disabled: '#A8A095',
          disabledDark: '#6B645C',
        },
        border: {
          hairline: '#E4DFD6',
          hairlineDark: '#35302B',
        },
        destructive: '#B91C1C',
        destructiveDark: '#F87171',
      },
      borderRadius: {
        sm: '2px',
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
