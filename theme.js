// Run before the stylesheet: the first painted frame uses the resolved theme.
(() => {
  'use strict';
  const KEY = 'pokedex-theme';
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = (value) => value === 'light' || value === 'dark';
  let preference = null;
  let toggle;

  function readPreference() {
    try {
      const value = localStorage.getItem(KEY);
      return valid(value) ? value : null;
    } catch { return null; }
  }

  function applyTheme() {
    const theme = preference || (system.matches ? 'dark' : 'light');
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#10171e' : '#f3f8f5';
    if (toggle) {
      const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
    }
  }

  preference = readPreference();
  applyTheme();
  system.addEventListener('change', () => { if (!preference) applyTheme(); });
  // Keep other tabs in sync, including when a saved preference is removed.
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return;
    preference = readPreference();
    applyTheme();
  });
  document.addEventListener('DOMContentLoaded', () => {
    toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(KEY, preference); } catch { /* Keep working in memory if storage is unavailable. */ }
        applyTheme();
      });
    }
    applyTheme();
    // Initial rendering must not animate from the fallback palette.
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('theme-ready')));
  });
})();
