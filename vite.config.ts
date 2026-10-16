// File: /vite.config.ts | Version: 0.1.1
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
  build: { outDir: '../dist', emptyOutDir: true },
});