import { writable } from 'svelte/store';

type Theme = 'light' | 'dark';

function createThemeStore() {
  // Check for saved theme preference or default to 'light'
  const storedTheme = typeof window !== 'undefined' 
    ? (localStorage.getItem('theme') as Theme) || 'light'
    : 'light';
  
  const store = writable<Theme>(storedTheme);
  const { subscribe, set: setStore, update: updateStore } = store;

  return {
    subscribe,
    toggle: () => {
      updateStore(theme => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        if (typeof window !== 'undefined') {
          localStorage.setItem('theme', newTheme);
          // Remove old theme class and add new one without affecting other classes
          document.documentElement.classList.remove('light', 'dark');
          document.documentElement.classList.add(newTheme);
        }
        return newTheme;
      });
    },
    set: (newTheme: Theme) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', newTheme);
        // Remove old theme class and add new one without affecting other classes
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(newTheme);
      }
      setStore(newTheme);
    },
    init: () => {
      if (typeof window !== 'undefined') {
        const savedTheme = (localStorage.getItem('theme') as Theme) || 
          (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        
        // Remove any existing theme classes and add the correct one
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(savedTheme);
        setStore(savedTheme);
      }
    }
  };
}

export const theme = createThemeStore();