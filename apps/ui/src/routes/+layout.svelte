<script lang="ts">
	import BackgroundHost from '$lib/BackgroundHost.svelte';
	import Avatar from '$lib/Avatar.svelte';
	import PhantomLogo from '$lib/PhantomLogo.svelte';
	import { beforeNavigate, goto, onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { leaveRoomForStoredUser, pingPresence } from '$lib/api';
	import { parseRoomCode } from '$lib/roomCodes';
	import { LS } from '$lib/storage';
	import DoorOpen from '@lucide/svelte/icons/door-open';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import UserRound from '@lucide/svelte/icons/user-round';
	import {
		DEFAULT_PLAYER_COLOR,
		DEFAULT_PLAYER_ICON,
		isCompleteUserProfile,
		PLAYER_COLOR_PRESETS,
		PLAYER_ICON_PRESETS,
	} from '@repo/shared/onlineGame';
	import { onMount } from 'svelte';
	import './layout.css';
	import { setAppContext } from '$lib/appContext';
	import type { AppContext } from '$lib/appContext';
	import { sample } from 'es-toolkit';

	const browser = typeof window !== 'undefined';
	const presencePingMs = 10_000;
	let { children, data } = $props();

	const appContext = $state<AppContext>({
		theme: LS.get('dark_mode') ? 'dark' : 'light',
		user: {
			name: 'some soul',
			id: -1,
			color: sample(PLAYER_COLOR_PRESETS).id,
			icon: sample(PLAYER_ICON_PRESETS).id,
			unsaved: true,
		},
	});
	setAppContext(appContext);
	$effect(() => {
		appContext.user = data.user!;
	});

	let supportsViewTransitions = $state(false);
	let isViewTransitioning = $state(false);
	let settingsMenuState = $state<'closed' | 'open' | 'closing'>('closed');
	let settingsCloseTimer: ReturnType<typeof setTimeout> | undefined;
	let manualViewTransition = false;
	let profileCheckId = 0;
	const activePath = $derived(page.url.pathname);
	const activeRoute = $derived(`${page.url.pathname}${page.url.search}${page.url.hash}`);
	const activeRoomCode = $derived(roomCodeFromPath(activePath));
	const isBareScreen = $derived(activePath === '/' || activePath === '/setup');
	const isLobbyScreen = $derived(activePath === '/lobby');
	const isRoomScreen = $derived(Boolean(activeRoomCode));
	const setupHref = $derived(`/setup?returnTo=${encodeURIComponent(activeRoute)}`);
	const theme = $derived(appContext.theme);

	beforeNavigate(navigation => {
		if (!browser || navigation.type === 'popstate' || navigation.willUnload || !navigation.to) return;

		const nextUrl = withPersistentDebugId(navigation.to.url);
		if (sameUrl(nextUrl, navigation.to.url)) return;

		navigation.cancel();
		void goto(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`, { noScroll: true });
	});

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
		LS.set({ dark_mode: theme === 'dark' });
	});

	$effect(() => {
		appContext.user = data.user;
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
		const handleOutsidePointer = (event: PointerEvent) => {
			if (settingsMenuState === 'closed' || !(event.target instanceof Element)) return;
			if (event.target.closest('.settings-menu-wrap')) return;
			closeSettings();
		};
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') closeSettings();
		};
		const presenceInterval = window.setInterval(() => {
			void pingPresenceForPath(window.location.pathname);
		}, presencePingMs);

		void pingPresenceForPath(window.location.pathname);
		document.addEventListener('click', handleLinkClick, true);
		document.addEventListener('pointerdown', handleOutsidePointer, true);
		document.addEventListener('keydown', handleEscape);

		return () => {
			stopStorage();
			window.clearInterval(presenceInterval);
			if (settingsCloseTimer) clearTimeout(settingsCloseTimer);
			document.removeEventListener('click', handleLinkClick, true);
			document.removeEventListener('pointerdown', handleOutsidePointer, true);
			document.removeEventListener('keydown', handleEscape);
		};
	});

	$effect(() => {
		void checkProfileForPath(page.url);
	});

	$effect(() => {
		void pingPresenceForPath(page.url.pathname);
	});

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
			if (checkId !== profileCheckId) return;
			if (!isCompleteUserProfile(appContext.user)) {
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

	async function pingPresenceForPath(path: string) {
		if (!browser || isPublicPath(path)) return;

		try {
			await pingPresence();
		} catch {}
	}

	function syncPlayerFromStorage() {
		playerName = LS.get('player_name') ?? '';
		playerColor = LS.get('player_color', DEFAULT_PLAYER_COLOR);
		playerIcon = LS.get('player_icon', DEFAULT_PLAYER_ICON);
	}

	function toggleTheme() {
		appContext.theme = theme === 'dark' ? 'light' : 'dark';
		closeSettings();
	}

	function openSettings() {
		if (settingsCloseTimer) clearTimeout(settingsCloseTimer);
		settingsMenuState = 'open';
	}

	function closeSettings() {
		if (settingsMenuState === 'closed') return;
		if (settingsCloseTimer) clearTimeout(settingsCloseTimer);
		settingsMenuState = 'closing';
		settingsCloseTimer = setTimeout(() => {
			settingsMenuState = 'closed';
		}, 240);
	}

	function toggleSettings() {
		if (settingsMenuState === 'open') closeSettings();
		else openSettings();
	}

	async function abandonSeance() {
		const roomCode = activeRoomCode;
		if (!roomCode) return;

		closeSettings();
		try {
			await leaveRoomForStoredUser(roomCode);
		} catch {}
		LS.set({ current_room: null });
		await goto(`/lobby${page.url.search}${page.url.hash}`, { noScroll: true });
	}

	function roomCodeFromPath(path: string): string | null {
		const match = /^\/room\/([A-Za-z]{4})$/.exec(path);
		return parseRoomCode(match?.[1]);
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
		const nextUrl = withPersistentDebugId(url);
		const next = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
		return current !== next;
	}

	async function navigateWithViewTransition(href: string) {
		const url = await resolveNavigationUrl(withPersistentDebugId(new URL(href)));
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
			if (isCompleteUserProfile(appContext.user)) return url;
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

	function withPersistentDebugId(url: URL): URL {
		if (!browser || url.origin !== window.location.origin || hasDebugId(url)) return url;

		const debugId = page.url.searchParams.get('DEBUG_ID') ?? page.url.searchParams.get('debug_id');
		if (!debugId) return url;

		const next = new URL(url);
		next.searchParams.set('DEBUG_ID', debugId);
		return next;
	}

	function hasDebugId(url: URL): boolean {
		return url.searchParams.has('DEBUG_ID') || url.searchParams.has('debug_id');
	}

	function sameUrl(a: URL, b: URL): boolean {
		return a.pathname === b.pathname && a.search === b.search && a.hash === b.hash;
	}

	function beginViewTransition(fromPath?: string, toPath?: string) {
		if (
			fromPath === '/' ||
			toPath === '/' ||
			fromPath === '/setup' ||
			toPath === '/setup' ||
			isRoomPath(fromPath) ||
			isRoomPath(toPath)
		) {
			document.documentElement.dataset.logoTransition = 'letters';
		}
		isViewTransitioning = true;
	}

	function isRoomPath(path: string | undefined): boolean {
		return Boolean(path && roomCodeFromPath(path));
	}

	function endViewTransition() {
		isViewTransitioning = false;
		delete document.documentElement.dataset.logoTransition;
	}
</script>

<div class:view-transitioning={isViewTransitioning} class="app-scene">
	<BackgroundHost />

	{#if isBareScreen}
		{@render children()}
	{:else}
		<div class:room-shell={isRoomScreen} class="screen-shell">
			<header class="screen-top">
				{#if activeRoomCode}
					<div class="room-code-mark" aria-label={`Room ${activeRoomCode}`}>{activeRoomCode}</div>
				{:else}
					<div class="top-logo-link">
						<PhantomLogo compact textOnly />
					</div>
				{/if}
				<div class="screen-actions">
					<div class="settings-menu-wrap">
						<button
							aria-expanded={settingsMenuState === 'open'}
							aria-haspopup="menu"
							class="user-profile-trigger"
							onclick={toggleSettings}
							type="button"
						>
							<span class="user-name">{appContext.user.name}</span>
							<Avatar user={appContext.user} name={false} />
						</button>

						{#if settingsMenuState !== 'closed'}
							<div class:closing={settingsMenuState === 'closing'} class="settings-menu" role="menu">
								<button onclick={toggleTheme} role="menuitem" type="button">
									{#if theme === 'dark'}
										<Sun size={17} strokeWidth={2.25} />
									{:else}
										<Moon size={17} strokeWidth={2.25} />
									{/if}
									<span>Let there be {theme === 'dark' ? 'light' : 'dark'}</span>
								</button>
								<a href={setupHref} onclick={closeSettings} role="menuitem">
									<UserRound size={17} strokeWidth={2.25} />
									<span>Change Yourself</span>
								</a>
								{#if activeRoomCode}
									<button onclick={abandonSeance} role="menuitem" type="button">
										<DoorOpen size={17} strokeWidth={2.25} />
										<span>Abandon séance</span>
									</button>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</header>

			<section class:lobby-card={isLobbyScreen} class:room-card={isRoomScreen} class="content-card">
				{#key activePath}
					<div class="route-frame">
						{@render children()}
					</div>
				{/key}
			</section>

			{#if activeRoomCode}
				<div class="room-bottom-logo">
					<PhantomLogo compact textOnly />
				</div>
			{/if}
		</div>
	{/if}
</div>
