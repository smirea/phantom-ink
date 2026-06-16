<script lang="ts">
	import BackgroundHost from '$lib/BackgroundHost.svelte';
	import InkButton from '$lib/InkButton.svelte';
	import PhantomLogo from '$lib/PhantomLogo.svelte';
	import PlayerAvatar from '$lib/PlayerAvatar.svelte';
	import { goto, onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { loadStoredUser } from '$lib/api';
	import { LS, storageKeys } from '$lib/storage';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import {
		DEFAULT_PLAYER_COLOR,
		DEFAULT_PLAYER_ICON,
		PLAYER_COLOR_PRESETS,
		isCompleteUserProfile,
		type PlayerColorId,
		type PlayerIconId,
	} from '@repo/shared/onlineGame';
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
	let playerName = $state(LS.get(storageKeys.playerName) ?? '');
	let playerColor = $state<PlayerColorId>(LS.get(storageKeys.playerColor, DEFAULT_PLAYER_COLOR));
	let playerIcon = $state<PlayerIconId>(LS.get(storageKeys.playerIcon, DEFAULT_PLAYER_ICON));
	let supportsViewTransitions = $state(false);
	let isViewTransitioning = $state(false);
	let manualViewTransition = false;
	let profileCheckId = 0;
	const activePath = $derived(page.url.pathname);
	const activeRoute = $derived(`${page.url.pathname}${page.url.search}${page.url.hash}`);
	const isBareScreen = $derived(activePath === '/' || activePath === '/setup');
	const setupHref = $derived(`/setup?returnTo=${encodeURIComponent(activeRoute)}`);
	const displayedPlayerName = $derived(playerName.trim() || 'Unknown');
	const displayedPlayerColor = $derived(
		PLAYER_COLOR_PRESETS.find(preset => preset.id === playerColor) ?? PLAYER_COLOR_PRESETS[0],
	);

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
		syncPlayerFromStorage();
		const stopStorage = LS.onChange(syncPlayerFromStorage);
		const handleLinkClick = (event: MouseEvent) => {
			const anchor = getAnchor(event.target);
			if (!anchor || !shouldHandleLink(event, anchor)) return;

			event.preventDefault();
			void navigateWithViewTransition(anchor.href);
		};

		document.addEventListener('click', handleLinkClick, true);

		return () => {
			stopStorage();
			document.removeEventListener('click', handleLinkClick, true);
		};
	});

	$effect(() => {
		void checkProfileForPath(page.url);
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

	async function checkProfileForPath(url: URL) {
		if (!browser) return;

		const path = url.pathname;
		const checkId = ++profileCheckId;
		if (isPublicPath(path)) return;

		try {
			const user = await loadStoredUser();
			if (checkId !== profileCheckId) return;
			if (!isCompleteUserProfile(user)) {
				const setupUrl = setupUrlForReturn(url);
				await goto(`${setupUrl.pathname}${setupUrl.search}${setupUrl.hash}`, { noScroll: true });
				return;
			}
		} catch {
			if (checkId === profileCheckId) {
				const setupUrl = setupUrlForReturn(url);
				await goto(`${setupUrl.pathname}${setupUrl.search}${setupUrl.hash}`, { noScroll: true });
			}
		}
	}

	function syncPlayerFromStorage() {
		playerName = LS.get(storageKeys.playerName) ?? '';
		playerColor = LS.get(storageKeys.playerColor, DEFAULT_PLAYER_COLOR);
		playerIcon = LS.get(storageKeys.playerIcon, DEFAULT_PLAYER_ICON);
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

		return setupUrlForReturn(url);
	}

	function setupUrlForReturn(returnUrl: URL): URL {
		const setupUrl = new URL('/setup', window.location.origin);
		const returnPath = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
		if (returnPath !== '/' && !returnUrl.pathname.startsWith('/setup')) {
			setupUrl.searchParams.set('returnTo', returnPath);
		}
		return setupUrl;
	}

	function beginViewTransition(fromPath?: string, toPath?: string) {
		if (fromPath === '/' || toPath === '/' || fromPath === '/setup' || toPath === '/setup') {
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
					<a class="top-logo-link" href={setupHref} aria-label="Edit profile">
						<PhantomLogo compact textOnly />
					</a>
					<div class="screen-actions">
						<InkButton size="sm" onclick={() => (theme = theme === 'dark' ? 'light' : 'dark')}>
							{theme === 'dark' ? 'Light' : 'Dark'}
						</InkButton>
						<a class="user-profile-link" href={setupHref} aria-label="Edit profile for {displayedPlayerName}">
							<span class="user-name">{displayedPlayerName}</span>
							<PlayerAvatar
								color={displayedPlayerColor.value}
								icon={playerIcon}
								label={`${displayedPlayerName} avatar`}
							/>
						</a>
					</div>
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
