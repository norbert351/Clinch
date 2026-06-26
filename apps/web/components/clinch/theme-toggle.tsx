'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const stored = (localStorage.getItem('clinch-theme') || 'dark') as 'dark' | 'light';
    const initial = stored === 'light' ? 'light' : 'dark';
    setTheme(initial);
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(initial);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('clinch-theme', next);
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className={[
        'flex h-8 w-8 items-center justify-center',
        'border border-[var(--border-subtle)]',
        'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
        'transition-all hover:border-[var(--accent-cyan)]',
        'hover:text-[var(--accent-cyan)]',
        className || '',
      ].join(' ')}
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}
