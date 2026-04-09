import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 3001,
    hmr: process.env.DISABLE_HMR !== 'true',
    proxy: {
      '/neo-api': {
        target: 'https://dev.neodomain.cn',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/neo-api/, ''),
      },
    },
  },
});
