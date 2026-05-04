/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        sage: { DEFAULT: '#7a8c6e', light: '#a3b296', pale: '#e8ede5', dark: '#5a6b4f' },
        cream: { DEFAULT: '#faf7f2', dark: '#f0ebe3' },
        terre: { DEFAULT: '#8b6f5c', light: '#b09683' },
        brun: { DEFAULT: '#5c4a3a', dark: '#3d3129' },
        blush: { DEFAULT: '#e8c4b0', light: '#f2ddd1', dark: '#c9967a' },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '10px' },
      boxShadow: {
        card: '0 2px 12px rgba(92,74,58,0.08)',
        'card-lg': '0 4px 24px rgba(92,74,58,0.12)',
      },
    },
  },
  plugins: [],
}
