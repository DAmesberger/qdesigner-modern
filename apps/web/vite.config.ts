import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';
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

export default defineConfig(({ mode }) => {
  const workspaceRoot = resolve(process.cwd(), '../..');
  const env = loadEnv(mode, workspaceRoot, '');
  const appHost = env.APP_HOST || 'localhost';
  const appPort = Number(env.APP_PORT || '4173');
  const serverPort = Number(env.SERVER_PORT || '4100');

  return {
    plugins: [tailwindcss(), sveltekit(), buildManifestPlugin()],
    envDir: workspaceRoot,
    clearScreen: false,
    build: {
      sourcemap: true,
      minify: false // Disable minification for better debugging
    },
    optimizeDeps: {
      include: ['svelte', '@sveltejs/kit']
    },
    server: {
      port: appPort,
      strictPort: true,
      host: true,
      fs: {
        allow: [
          resolve(process.cwd(), 'src'),
          resolve(process.cwd(), 'src/lib'),
          resolve(process.cwd(), 'src/routes'),
          resolve(process.cwd(), '.svelte-kit'),
          resolve(workspaceRoot, 'node_modules'),
          resolve(workspaceRoot, 'packages'),
        ],
      },
      hmr: {
        port: appPort,
        host: appHost
      },
      watch: {
        ignored: [
          '**/test-results/**',
          '**/playwright-report/**',
          '**/.playwright-artifacts-*/**',
        ],
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
          target: `http://localhost:${serverPort}`,
          changeOrigin: true,
          secure: false,
          ws: true
        }
      }
    },
    resolve: {
      alias: {
        '@qdesigner/contracts': resolve(workspaceRoot, 'packages/contracts/src/index.ts'),
        '@qdesigner/contracts/generated': resolve(
          workspaceRoot,
          'packages/contracts/src/generated'
        ),
        '@qdesigner/questionnaire-core': resolve(
          workspaceRoot,
          'packages/questionnaire-core/src/index.ts'
        ),
        '@qdesigner/questionnaire-core/questionnaire': resolve(
          workspaceRoot,
          'packages/questionnaire-core/src/questionnaire.ts'
        ),
        '@qdesigner/questionnaire-core/response': resolve(
          workspaceRoot,
          'packages/questionnaire-core/src/response.ts'
        ),
        '@qdesigner/questionnaire-core/media': resolve(
          workspaceRoot,
          'packages/questionnaire-core/src/media.ts'
        )
      }
    }
  };
});
