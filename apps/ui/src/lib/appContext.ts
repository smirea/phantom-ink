import type { User } from '@repo/shared/onlineGame';
import { createContext } from 'svelte';

export interface AppContext {
	theme: 'light' | 'dark';
	/** the root layout guards against this being null before the setup */
	user: User & { unsaved?: true };
}

export const [getAppContext, setAppContext] = createContext<AppContext>();
