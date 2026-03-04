import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

function buildManifestPlugin(): Plugin {
  return {
    name: 'qdesigner-build-manifest',
    apply: 'build',
    writeBundle(options, bundle) {
      const files: string[] = [];
      for (const [fileName] of Object.entries(bundle)) {
        if (/\.(js|css|woff2?|ttf|svg|png|jpg|webp|ico)$/.test(fileName)) {
          files.push(`/${fileName}`);
        }
      }

      const outDir = options.dir || resolve(process.cwd(), 'build');
      const clientDir = resolve(outDir, 'client');

      try {
        mkdirSync(clientDir, { recursive: true });
      } catch {
        // directory may already exist
      }

      const manifest = { version: Date.now(), files };
      writeFileSync(
        resolve(clientDir, 'build-manifest.json'),
        JSON.stringify(manifest, null, 2)
      );
      console.log(`[build-manifest] Generated manifest with ${files.length} files`);
    }
  };
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), buildManifestPlugin()],
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
    headers: {
      // Cross-origin isolation enables full-precision performance.now() (~5us)
      // without it, browsers reduce precision to ~100us as a Spectre mitigation.
      // Critical for fillout routes where reaction time measurement occurs.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  }
});