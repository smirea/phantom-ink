declare global {
	namespace App {}
}

declare module '$app/navigation' {
	export function onNavigate(
		callback: (navigation: import('@sveltejs/kit').OnNavigate) => void | (() => void) | Promise<void | (() => void)>,
	): void;
}

export {};
