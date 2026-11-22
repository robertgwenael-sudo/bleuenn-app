/** @type {import('tailwindcss').Config} */

// Les couleurs sémantiques pointent vers des variables CSS (triplets RGB)
// définies dans src/app/globals.css, en clair et en sombre. On garde la
// syntaxe <alpha-value> pour pouvoir écrire bg-primary/10, border-border/60…
const v = name => `rgb(var(--${name}) / <alpha-value>)`

module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: v('bg'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2'), 3: v('surface-3') },
        border: { DEFAULT: v('border'), strong: v('border-strong') },
        fg: { DEFAULT: v('fg'), muted: v('fg-muted'), subtle: v('fg-subtle') },
        primary: { DEFAULT: v('primary'), fg: v('primary-fg'), soft: v('primary-soft'), hover: v('primary-hover') },
        accent: { DEFAULT: v('accent'), fg: v('accent-fg'), soft: v('accent-soft') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
        violet: { DEFAULT: v('violet'), soft: v('violet-soft') },
        sidebar: { DEFAULT: v('sidebar'), fg: v('sidebar-fg'), muted: v('sidebar-muted'), active: v('sidebar-active'), border: v('sidebar-border') },
        ring: v('ring'),
        // Phases du calendrier de culture
        phase: { cellule: v('phase-cellule'), champ: v('phase-champ'), recolte: v('phase-recolte') },
        chart: { 1: v('chart-1'), 2: v('chart-2'), 3: v('chart-3') },
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      spacing: {
        sidebar: '15.5rem',
        'sidebar-collapsed': '4.25rem',
        topbar: '3.75rem',
        bottomnav: '4rem',
      },
      borderRadius: {
        card: '0.875rem',
        btn: '0.625rem',
      },
      boxShadow: {
        xs: '0 1px 2px rgb(var(--shadow) / 0.06)',
        card: '0 1px 2px rgb(var(--shadow) / 0.05), 0 2px 12px -4px rgb(var(--shadow) / 0.08)',
        pop: '0 12px 40px -8px rgb(var(--shadow) / 0.22), 0 2px 6px rgb(var(--shadow) / 0.08)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-out': { from: { opacity: '1' }, to: { opacity: '0' } },
        'dialog-in': { from: { opacity: '0', transform: 'translate(-50%, -48%) scale(0.97)' }, to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' } },
        'sheet-in': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'drawer-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'fade-out': 'fade-out 120ms ease-in',
        'dialog-in': 'dialog-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        'sheet-in': 'sheet-in 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        'drawer-in': 'drawer-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
