import type { RoomViewState } from '@repo/shared/onlineGame';

declare global {
	namespace App {
		interface PageState {
			optimisticRoom?: RoomViewState;
		}
	}
}

declare module '$app/navigation' {
	export function beforeNavigate(callback: (navigation: import('@sveltejs/kit').BeforeNavigate) => void): void;

	export function goto(
		url: string | URL,
		opts?: {
			replaceState?: boolean;
			noScroll?: boolean;
			keepFocus?: boolean;
			invalidateAll?: boolean;
			state?: App.PageState;
		},
	): Promise<void>;

	export function onNavigate(
		callback: (navigation: import('@sveltejs/kit').OnNavigate) => void | (() => void) | Promise<void | (() => void)>,
	): void;
}

export {};
