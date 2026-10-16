// File: /web/main.tsx | Version: 0.1.1
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { applyTheme, readThemePreference } from './theme.js';
import './styles.css';

applyTheme(readThemePreference());
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);