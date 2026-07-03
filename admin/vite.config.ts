import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Servido sob /admin/ em produção (ver deploy/Caddyfile).
// Em dev, /api é redirecionado para o backend (porta 3001).
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
