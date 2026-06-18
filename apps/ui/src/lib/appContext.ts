import type { User } from '@repo/shared/onlineGame';
import { createContext } from 'svelte';

export type AppUser = User & { unsaved?: true };

export interface AppContext {
	theme: 'light' | 'dark';
	user: AppUser;
	saveUser: () => Promise<User>;
}

export const [getAppContext, setAppContext] = createContext<AppContext>();
