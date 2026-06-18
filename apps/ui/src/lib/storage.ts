import createLocalStorage from './createLocalStorage';

const searchParams = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
export const DEBUG_ID = searchParams.get('DEBUG_ID') || searchParams.get('debug_id') || null;
const storageNamespace = `phantom-ink${DEBUG_ID ? `-DEBUG_ID=${DEBUG_ID}` : ''}`;

export const { LS } = createLocalStorage<{
	current_room: string | null;
	dark_mode: boolean;
	userId: number | null;
}>({
	namespace: storageNamespace,
	getDefaults: () => ({
		current_room: null,
		dark_mode: true,
		userId: null,
	}),
});
