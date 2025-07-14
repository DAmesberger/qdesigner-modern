import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';

// Disable SSR for fillout - it needs to run fully client-side for offline support
export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = async ({ params, url }) => {
	// Add fillout class to body for styling
	if (browser) {
		document.body.classList.add('fillout');
	}

	return {
		// Pass any global fillout data here
		filloutMode: true,
		timestamp: Date.now()
	};
};