/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Verts champêtres
        sage: { DEFAULT: '#6b7f5e', light: '#8fa77d', pale: '#e9efe5', dark: '#4a5c3e' },
        feuille: { DEFAULT: '#3d5a3a', dark: '#2a3f28', light: '#5a7a56' },
        // Roses floraux
        rose: { DEFAULT: '#d4a0a0', light: '#f0d5d5', pale: '#faf0f0', dark: '#b87878', deep: '#9e5e5e' },
        pivoine: { DEFAULT: '#c77d8a', light: '#e4b3bc', dark: '#a15a67' },
        // Neutres chauds
        lin: { DEFAULT: '#f5f0e8', dark: '#e8dfd3', light: '#faf7f2' },
        ivoire: { DEFAULT: '#fefcf8', dark: '#f5f0e6' },
        terre: { DEFAULT: '#8b7355', light: '#b09a7d', dark: '#6b5740' },
        brun: { DEFAULT: '#4a3f35', dark: '#2d2620', light: '#6b5f52' },
        // Accents
        or: { DEFAULT: '#c9a96e', light: '#e0cc9f', dark: '#a68840' },
        lavande: { DEFAULT: '#9b8ec4', light: '#c7bee0', pale: '#eeeaf5' },
        // Anciennes couleurs (backward compat)
        cream: { DEFAULT: '#faf7f2', dark: '#e8dfd3' },
        blush: { DEFAULT: '#d4a0a0', light: '#f0d5d5', dark: '#b87878' },
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
