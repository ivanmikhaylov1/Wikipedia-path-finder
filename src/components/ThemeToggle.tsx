import { Moon, Sun } from 'lucide-react';

export function ThemeToggle({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) {
  return <button className="theme-toggle" type="button" onClick={onToggle} aria-label={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'} title="Сменить тему">
    {theme === 'light' ? <Moon size={18} strokeWidth={1.8} /> : <Sun size={18} strokeWidth={1.8} />}
  </button>;
}
