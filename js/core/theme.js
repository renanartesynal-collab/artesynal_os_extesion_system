// --- js/core/theme.js ---
// Gerenciador global de Tema (Dark / Light) e notificações Toast da Artesynal

const THEME_STORAGE_KEY = 'artesynal_theme';

export function getSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return 'dark';
}

export function applyTheme(theme) {
  const target = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', target);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, target);
  } catch {}
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    const isLight = target === 'light';
    btn.innerHTML = isLight ? '🌙 <span class="hide-sm">Escuro</span>' : '☀️ <span class="hide-sm">Claro</span>';
    btn.title = isLight ? 'Mudar para modo escuro' : 'Mudar para modo claro';
  });
  return target;
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getSavedTheme();
  return applyTheme(current === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
  const current = applyTheme(getSavedTheme());
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    if (btn.dataset.themeBound === '1') return;
    btn.dataset.themeBound = '1';
    btn.addEventListener('click', () => toggleTheme());
  });
  return current;
}

export function showToast(message, type = 'info', durationMs = 3400) {
  let root = document.getElementById('artesynal-toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'artesynal-toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `ui-toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ';
  el.innerHTML = `<span>${icon}</span><span>${String(message || '')}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = 'all 0.2s ease';
    setTimeout(() => el.remove(), 220);
  }, durationMs);
}

if (typeof document !== 'undefined') {
  applyTheme(getSavedTheme());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initTheme());
  } else {
    initTheme();
  }
}
