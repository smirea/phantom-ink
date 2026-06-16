<script lang="ts">
	import BackgroundHost from '$lib/BackgroundHost.svelte';
	import InkButton from '$lib/InkButton.svelte';
	import PhantomLogo from '$lib/PhantomLogo.svelte';
	import { goto, onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { loadStoredUser } from '$lib/api';
	import { LS, storageKeys } from '$lib/storage';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { isCompleteUserProfile } from '@repo/shared/onlineGame';
	import { onMount } from 'svelte';
	import './layout.css';

	let { children } = $props();
	const browser = typeof window !== 'undefined';
	type Theme = 'dark' | 'light';

	const navItems = [
		{ href: '/', label: 'Start' },
		{ href: '/lobby', label: 'Lobby' },
		{ href: '/pad', label: 'Pad' },
		{ href: '/whispers', label: 'Whispers' },
	];
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser,
			},
		},
	});

	let theme = $state<Theme>(LS.get(storageKeys.darkMode) ? 'dark' : 'light');
	let supportsViewTransitions = $state(false);
	let isViewTransitioning = $state(false);
	let manualViewTransition = false;
	let profileCheckId = 0;
	const activePath = $derived(page.url.pathname);
	const isBareScreen = $derived(activePath === '/' || activePath === '/setup');

	onNavigate(navigation => {
		if (!browser || !supportsViewTransitions || manualViewTransition) return;

		const fromPath = navigation.from?.url.pathname;
		const toPath = navigation.to?.url.pathname;

		beginViewTransition(fromPath, toPath);
		return new Promise<void>(resolve => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			transition.finished.finally(endViewTransition);
		});
	});

	$effect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.dataset.theme = theme;
		LS.set({ [storageKeys.darkMode]: theme === 'dark' });
	});

	onMount(() => {
		supportsViewTransitions = Boolean(document.startViewTransition) && !prefersReducedMotion();
		const handleLinkClick = (event: MouseEvent) => {
			const anchor = getAnchor(event.target);
			if (!anchor || !shouldHandleLink(event, anchor)) return;

			event.preventDefault();
			void navigateWithViewTransition(anchor.href);
		};

		document.addEventListener('click', handleLinkClick, true);

		return () => {
			document.removeEventListener('click', handleLinkClick, true);
		};
	});

	$effect(() => {
		void checkProfileForPath(activePath);
	});

	function isActive(href: string): boolean {
		return href === '/' ? activePath === '/' : activePath.startsWith(href);
	}

	function prefersReducedMotion(): boolean {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function isPublicPath(path: string): boolean {
		return path === '/' || path === '/setup';
	}

	async function checkProfileForPath(path: string) {
		if (!browser) return;

		const checkId = ++profileCheckId;
		if (isPublicPath(path)) return;

		try {
			const user = await loadStoredUser();
			if (checkId !== profileCheckId) return;
			if (!isCompleteUserProfile(user)) {
				await goto('/setup', { noScroll: true });
				return;
			}
		} catch {
			if (checkId === profileCheckId) {
				await goto('/setup', { noScroll: true });
			}
		}
	}

	function getAnchor(target: EventTarget | null): HTMLAnchorElement | null {
		if (!(target instanceof Element)) return null;
		return target.closest('a[href]');
	}

	function shouldHandleLink(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
		if (!supportsViewTransitions || event.defaultPrevented || event.button !== 0) return false;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
		if (anchor.target && anchor.target !== '_self') return false;
		if (anchor.hasAttribute('download') || anchor.hasAttribute('data-sveltekit-reload')) return false;

		const url = new URL(anchor.href);
		if (url.origin !== window.location.origin) return false;

		const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
		const next = `${url.pathname}${url.search}${url.hash}`;
		return current !== next;
	}

	async function navigateWithViewTransition(href: string) {
		const url = await resolveNavigationUrl(new URL(href));
		const next = `${url.pathname}${url.search}${url.hash}`;

		manualViewTransition = true;
		beginViewTransition(window.location.pathname, url.pathname);
		const transition = document.startViewTransition(async () => {
			await goto(next, { noScroll: true });
		});

		try {
			await transition.finished;
		} finally {
			manualViewTransition = false;
			endViewTransition();
		}
	}

	async function resolveNavigationUrl(url: URL): Promise<URL> {
		if (isPublicPath(url.pathname)) return url;

		try {
			const user = await loadStoredUser();
			if (isCompleteUserProfile(user)) return url;
		} catch {}

		return new URL('/setup', window.location.origin);
	}

	function beginViewTransition(fromPath?: string, toPath?: string) {
		if (fromPath === '/' || toPath === '/') {
			document.documentElement.dataset.logoTransition = 'letters';
		}
		isViewTransitioning = true;
	}

	function endViewTransition() {
		isViewTransitioning = false;
		delete document.documentElement.dataset.logoTransition;
	}
</script>

<QueryClientProvider client={queryClient}>
	<div class:view-transitioning={isViewTransitioning} class="app-scene">
		<BackgroundHost />

		{#if isBareScreen}
			{@render children()}
		{:else}
			<div class="screen-shell">
				<header class="screen-top">
					<a class="top-logo-link" href="/" aria-label="Phantom Ink start">
						<PhantomLogo compact textOnly />
					</a>
					<InkButton size="sm" onclick={() => (theme = theme === 'dark' ? 'light' : 'dark')}>
						{theme === 'dark' ? 'Light' : 'Dark'}
					</InkButton>
				</header>

				<section class="content-card">
					<nav class="screen-nav" aria-label="Dummy screens">
						{#each navItems as item}
							<a href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
								{item.label}
							</a>
						{/each}
					</nav>

					{#key activePath}
						<div class="route-frame">
							{@render children()}
						</div>
					{/key}
				</section>
			</div>
		{/if}
	</div>
</QueryClientProvider>
