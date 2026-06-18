import { browser } from '$app/environment';
import type { LayoutLoad } from './$types';
import { api } from '$lib/api';
import { LS } from '$lib/storage';

export const ssr = false;

export const load: LayoutLoad = async () => {
	if (!browser) return { user: null };
	const userId = LS.get('userId');
	if (!userId) return { user: null };
	const payload = await api.users.get({ userId });
	if (!payload.user) LS.set({ userId: null });
	return payload;
};
