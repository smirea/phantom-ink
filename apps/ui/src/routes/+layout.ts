import { browser } from '$app/environment';
import type { LayoutLoad } from './$types';
import { api } from '$lib/api';

export const ssr = false;

export const load: LayoutLoad = async () => {
	if (!browser) return { user: null };
	const { LS } = await import('$lib/storage');
	const userId = LS.get('userId');
	if (!userId) return { user: null };
	return await api.users.get({ userId });
};
