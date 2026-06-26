import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        void: 'var(--bg-void)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        overlay: 'var(--bg-overlay)',
        sidebar: 'var(--bg-sidebar)',
        'border-subtle': 'var(--border-subtle)',
        'border-default': 'var(--border-default)',
        'border-strong': 'var(--border-strong)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        cyan: 'var(--accent-cyan)',
        'cyan-dim': 'var(--accent-cyan-dim)',
        usdc: 'var(--accent-blue)',
        'usdc-dim': 'var(--accent-blue-dim)',
        violet: 'var(--accent-violet)',
        'violet-dim': 'var(--accent-violet-dim)',
        active: 'var(--status-active)',
        pending: 'var(--status-pending)',
        dispute: 'var(--status-dispute)',
        resolve: 'var(--status-resolve)',
        closed: 'var(--status-closed)',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'Courier New', 'monospace'],
      },
      backgroundImage: {
        'brand-gradient':
          'linear-gradient(135deg, #00D4FF 0%, #2775CA 50%, #7B3FFF 100%)',
        'brand-gradient-subtle':
          'linear-gradient(135deg, #00D4FF15 0%, #2775CA10 50%, #7B3FFF15 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
