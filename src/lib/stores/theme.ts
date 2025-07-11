import { writable } from 'svelte/store';

type Theme = 'light' | 'dark';

function createThemeStore() {
  // Check for saved theme preference or default to 'light'
  const storedTheme = typeof window !== 'undefined' 
    ? (localStorage.getItem('theme') as Theme) || 'light'
    : 'light';
  
  const { subscribe, set, update } = writable<Theme>(storedTheme);

  return {
    subscribe,
    toggle: () => {
      update(theme => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        if (typeof window !== 'undefined') {
          localStorage.setItem('theme', newTheme);
          document.documentElement.classList.remove('light', 'dark');
          document.documentElement.classList.add(newTheme);
        }
        return newTheme;
      });
    },
    set: (theme: Theme) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', theme);
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
      }
      set(theme);
    },
    init: () => {
      if (typeof window !== 'undefined') {
        const savedTheme = (localStorage.getItem('theme') as Theme) || 
          (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(savedTheme);
        set(savedTheme);
      }
    }
  };
}

export const theme = createThemeStore();