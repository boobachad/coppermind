import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'solarized-light' | 'blue-light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('app_theme');
    // Migrate old 'light' -> 'solarized-light' if needed, or default
    if (saved === 'light') return 'solarized-light';
    return (saved as Theme) || 'solarized-light';
  });

  useEffect(() => {
    console.log('Theme changed to:', theme);
    localStorage.setItem('app_theme', theme);
    const root = window.document.documentElement;

    // Remove old class-based dark mode
    root.classList.remove('dark');
    root.setAttribute('data-theme', theme);

    // Keep 'dark' class for Tailwind 'dark:' prefix compatibility if in dark mode
    if (theme === 'dark') {
      root.classList.add('dark');
    }
  }, [theme]);


  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
