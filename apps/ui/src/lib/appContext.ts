import type { UserRecord } from '@repo/shared/onlineGame';
import { createContext } from 'svelte';

export interface AppContext {
	theme: 'light' | 'dark';
	user: UserRecord | null;
}

export const [getAppContext, setAppContext] = createContext<AppContext>();

export const updateAppContext = (diff: Partial<AppContext>) => setAppContext({ ...getAppContext(), ...diff });
