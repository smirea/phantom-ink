import { browser } from '$app/environment';
import { loadStoredUser } from '$lib/api';
import type { LayoutLoad } from './$types';

export const prerender = true;
export const ssr = false;

export const load: LayoutLoad = async () => {
	if (!browser) return { user: null };

	return { user: await loadStoredUser() };
};
