import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

export function Header() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('perehody-theme');
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch { return 'system'; }
  });
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? media.matches ? 'dark' : 'light' : theme;
      document.documentElement.dataset.theme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
    };
    apply(); media.addEventListener('change', apply);
    try { localStorage.setItem('perehody-theme', theme); } catch { /* Storage is optional. */ }
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return <header className="header page-width">
    <a href="#search" className="wordmark">Переходы</a>
    <label className="theme-control">Тема
      <select aria-label="Тема" value={theme} onChange={event => setTheme(event.target.value as Theme)}>
        <option value="light">Светлая</option><option value="dark">Тёмная</option><option value="system">Системная</option>
      </select>
    </label>
  </header>;
}
