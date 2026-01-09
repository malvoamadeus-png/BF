import { defineConfig } from 'vite';

export default defineConfig({
  root: './public',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://8.159.141.123:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});

