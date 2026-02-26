import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  build: {
    sourcemap: true,
    minify: false // Disable minification for better debugging
  },
  optimizeDeps: {
    include: ['svelte', '@sveltejs/kit']
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    hmr: {
      port: 5173,
      host: 'localhost'
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  }
});