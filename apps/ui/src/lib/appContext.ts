import type { User } from '@repo/shared/onlineGame';
import { createContext } from 'svelte';

export interface AppContext {
	theme: 'light' | 'dark';
	user: User | null;
}

export const [getAppContext, setAppContext] = createContext<AppContext>();

export const updateAppContext = (diff: Partial<AppContext>) => setAppContext({ ...getAppContext(), ...diff });
