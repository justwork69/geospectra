const THEME_STORAGE_KEY = 'skyanalyst-theme';

export type AppTheme = 'dark' | 'light';

export const getAppTheme = (): AppTheme => {
  if (typeof window === 'undefined') return 'dark';

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

export const setAppTheme = (theme: AppTheme) => {
  if (typeof document === 'undefined') return;

  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('light', theme === 'light');
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent('theme-change', { detail: theme }));
};
