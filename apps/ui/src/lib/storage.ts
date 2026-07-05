import { LocalStorage } from './createLocalStorage';
import { debugIdFromSearch } from './debugId';

const DEBUG_ID = typeof location === 'undefined' ? null : debugIdFromSearch(location.search);
const storageNamespace = `phantom-ink${DEBUG_ID ? `-DEBUG_ID=${DEBUG_ID}` : ''}`;

export const LS = new LocalStorage<{
	dark_mode: boolean;
	userId: number | null;
}>({
	namespace: storageNamespace,
	getDefaults: () => ({
		dark_mode: true,
		userId: null,
	}),
});
