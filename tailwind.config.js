const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        ink: token('ink'),
        muted: token('muted'),
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          tint: token('accent-tint'),
          ink: token('accent-ink'),
        },
        positive: token('positive'),
        negative: { DEFAULT: token('negative'), tint: token('negative-tint') },
      },
      borderRadius: { xl: '0.75rem' },
    },
  },
  plugins: [],
};
