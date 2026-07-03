import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No EasyPanel o admin fica na raiz do próprio subdomínio (base '/').
// Em dev, /api é redirecionado para o backend (porta 3001).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
