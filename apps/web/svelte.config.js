import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    alias: {
      '@qdesigner/contracts': '../../packages/contracts/src/index.ts',
      '@qdesigner/contracts/generated': '../../packages/contracts/src/generated',
      '@qdesigner/questionnaire-core': '../../packages/questionnaire-core/src/index.ts',
      '@qdesigner/questionnaire-core/questionnaire':
        '../../packages/questionnaire-core/src/questionnaire.ts',
      '@qdesigner/questionnaire-core/response':
        '../../packages/questionnaire-core/src/response.ts',
      '@qdesigner/questionnaire-core/media': '../../packages/questionnaire-core/src/media.ts',
      '@qdesigner/scripting-engine': '../../packages/scripting-engine/src/index.ts',
    },
    // adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
    // If your environment is not supported or you settled on a specific environment, switch out the adapter.
    // See https://kit.svelte.dev/docs/adapters for more information about adapters.
    adapter: adapter()
  }
};

export default config;
