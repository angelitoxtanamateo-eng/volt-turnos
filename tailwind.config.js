/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        volt: { bg: '#0B0F19', card: '#161B2A', line: '#232A3D', violet: '#8B5CF6', violet2: '#A78BFA', white: '#F8FAFC', muted: '#94A3B8', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' }
      },
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      keyframes: { 'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } } },
      animation: { 'fade-up': 'fade-up .25s ease-out both' }
    }
  },
  plugins: []
}
