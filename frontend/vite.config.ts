import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em dev, /api é redirecionado para o backend (porta 3001).
// Em produção, o Caddy faz o reverse_proxy de /api/* para o mesmo backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
