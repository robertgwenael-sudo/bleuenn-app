/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Verts doux champêtres
        sage: { DEFAULT: '#8a9e7a', light: '#a8bda0', pale: '#eef3eb', dark: '#62785a' },
        feuille: { DEFAULT: '#5e7a58', dark: '#3f5a3a', light: '#7a9a72' },
        // Roses floraux doux
        rose: { DEFAULT: '#d4a8a8', light: '#f0d9d9', pale: '#faf2f2', dark: '#c08888', deep: '#a06868' },
        pivoine: { DEFAULT: '#cc909a', light: '#e8c0c8', dark: '#a86878' },
        // Neutres chauds
        lin: { DEFAULT: '#f7f3ed', dark: '#ece5db', light: '#fbf9f6' },
        ivoire: { DEFAULT: '#fefcf8', dark: '#f5f0e6' },
        terre: { DEFAULT: '#9a8872', light: '#b8a894', dark: '#7a6850' },
        brun: { DEFAULT: '#5a5048', dark: '#3a3230', light: '#7a706a' },
        // Accents
        or: { DEFAULT: '#d4b87a', light: '#e8d8a8', dark: '#b89850' },
        lavande: { DEFAULT: '#a898c8', light: '#cec4e0', pale: '#f0ecf5' },
        // Anciennes couleurs (backward compat)
        cream: { DEFAULT: '#fbf8f4', dark: '#ece5db' },
        blush: { DEFAULT: '#d4a8a8', light: '#f0d9d9', dark: '#c08888' },
      },
      fontFamily: {
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['Lato', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
        btn: '10px',
      },
      boxShadow: {
        card: '0 2px 16px rgba(75,63,53,0.06)',
        'card-lg': '0 6px 32px rgba(75,63,53,0.10)',
        'card-glow': '0 4px 24px rgba(197,125,138,0.12)',
        'inner-soft': 'inset 0 1px 3px rgba(75,63,53,0.06)',
      },
      backgroundImage: {
        'floral-pattern': "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M30 30c0-5.5 4.5-10 10-10s10 4.5 10 10-4.5 10-10 10-10-4.5-10-10zm-20 0c0-5.5 4.5-10 10-10s10 4.5 10 10-4.5 10-10 10-10-4.5-10-10z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
}
