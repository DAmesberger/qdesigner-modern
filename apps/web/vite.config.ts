import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// Paraglide i18n (ADR 0019). Compiles messages/{locale}.json into
// tree-shakeable m.*() calls at ./src/lib/paraglide. Keep `strategy` in sync
// with the `paraglide:compile` script in package.json (which regenerates the
// same output for `check`/`test`, where the Vite pipeline does not run).
const PARAGLIDE_STRATEGY = ['cookie', 'preferredLanguage', 'baseLocale'] as const;

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
    plugins: [
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/lib/paraglide',
        strategy: [...PARAGLIDE_STRATEGY],
      }),
      tailwindcss(),
      sveltekit(),
      buildManifestPlugin(),
    ],
    envDir: workspaceRoot,
    clearScreen: false,
    esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
    build: {
      sourcemap: mode !== 'production',
      minify: mode === 'production' ? 'esbuild' : false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('monaco-editor')) return 'monaco';
            if (id.includes('chart.js')) return 'charts';
            if (id.includes('mathjs')) return 'mathjs';
            if (id.includes('yjs')) return 'yjs';
          }
        }
      }
    },
    optimizeDeps: {
      // NB: never add '@sveltejs/kit' here. SvelteKit's own Vite plugin
      // deliberately puts it in optimizeDeps.exclude — prebundling it produces
      // a second copy of its control classes (Redirect/HttpError), so a
      // `throw redirect()` from a universal load fails the runtime's
      // `instanceof Redirect` check during hydration and surfaces as a 500
      // error page instead of navigating. (sveltejs/kit#5952)
      //
      // The svelte/* submodules below are reachable ONLY through the
      // lazily-loaded, ssr=false designer route (svelte/motion + svelte/easing
      // via AppLoader; svelte/transition + svelte/animate via Dialog /
      // MultipleChoice). Because they are not seen during the initial dep scan,
      // Vite discovers them at navigation time and triggers a re-optimization;
      // if the cache is invalidated in that window the browser 504s on the
      // stale hash and the dynamic import of the designer node rejects with
      // "Failed to fetch dynamically imported module" — a bare 500 on open.
      // Pre-including them makes the optimize set deterministic so the designer
      // route never depends on runtime re-optimization.
      include: [
        'svelte',
        'svelte/motion',
        'svelte/easing',
        'svelte/transition',
        'svelte/animate'
      ]
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
