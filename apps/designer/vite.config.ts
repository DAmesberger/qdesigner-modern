import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '$lib': path.resolve(__dirname, './src/lib'),
      '@qdesigner/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@qdesigner/renderer': path.resolve(__dirname, '../../packages/renderer/src'),
      '@qdesigner/scripting-engine': path.resolve(__dirname, '../../packages/scripting-engine/src')
    }
  },
  server: {
    port: 5173
  }
});