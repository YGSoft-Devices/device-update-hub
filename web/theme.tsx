// File: /web/theme.tsx | Version: 0.1.1
import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { copy as text } from './copy.js';

type ThemePreference = 'system' | 'light' | 'dark';
const storageKey = 'duh-theme';
export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return 'system';
}
export function applyTheme(preference: ThemePreference): void {
  document.documentElement.dataset.theme = preference === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
}
export function ThemeControl() {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(preference);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [preference]);
  const Icon = preference === 'system' ? Monitor : preference === 'dark' ? Moon : Sun;
  return <label className="theme-control" title={text.theme}><Icon size={16} aria-hidden="true" /><select aria-label={text.theme} value={preference} onChange={(event) => {
    const value = event.target.value as ThemePreference;
    try { localStorage.setItem(storageKey, value); } catch {}
    setPreference(value);
  }}><option value="system">{text.systemTheme}</option><option value="light">{text.lightTheme}</option><option value="dark">{text.darkTheme}</option></select></label>;
}