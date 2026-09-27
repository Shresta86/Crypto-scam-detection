import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5001',
      '/trace': 'http://localhost:5001',
      '/history': 'http://localhost:5001',
      '/monitor': 'http://localhost:5001',
      '/alerts': 'http://localhost:5001',
      '/export': 'http://localhost:5001',
      '/report': 'http://localhost:5001',
      '/dashboard': 'http://localhost:5001',
      '/graph': 'http://localhost:5001'
    }
  }
});
