<script lang="ts">
	import BackgroundHost from '$lib/BackgroundHost.svelte';
	import Avatar from '$lib/Avatar.svelte';
	import PhantomLogo from '$lib/PhantomLogo.svelte';
	import { beforeNavigate, goto, onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import { debugIdFromUrl, hasDebugId } from '$lib/debugId';
	import { parseRoomCode } from '$lib/roomCodes';
	import { LS } from '$lib/storage';
	import DoorOpen from '@lucide/svelte/icons/door-open';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import UserRound from '@lucide/svelte/icons/user-round';
	import type { PhantomInkGameState } from '@repo/shared/game';
	import {
		isValidPlayerName,
		playerIdForUser,
		PLAYER_COLOR_PRESETS,
		PLAYER_ICON_PRESETS,
		type User,
	} from '@repo/shared/onlineGame';
	import { onMount } from 'svelte';
	import './layout.css';
	import { setAppContext } from '$lib/appContext';
	import type { AppContext, AppUser } from '$lib/appContext';
	import { debounce, sample } from 'es-toolkit';

	const browser = typeof window !== 'undefined';
	const presencePingMs = 10_000;
	const githubIssueUrl = 'https://github.com/smirea/phantom-ink/issues/new';
	type DebugWindow = Window & {
		DEBUG?: { getState?: () => PhantomInkGameState | null };
	};
	let { children, data } = $props();

	const appContext = $state<AppContext>({
		theme: LS.get('dark_mode') ? 'dark' : 'light',
		user: initialAppUser(),
		saveUser: async function saveCurrentUser(): Promise<User> {
			debouncedSaveUser.cancel();
			if (!canSaveUser(appContext.user)) throw new Error('Set your name first.');
			const user = {
				id: appContext.user.id,
				name: appContext.user.name,
				color: appContext.user.color,
				icon: appContext.user.icon,
			};
			const submittedUserKey = userSaveKey(user);
			if (user.id > 0 && submittedUserKey === lastSavedUserKey) return appContext.user;

			const saveId = ++userSaveSequence;
			const payload = await api.users.save({
				userId: user.id > 0 ? user.id : null,
				name: user.name,
				color: user.color,
				icon: user.icon,
			});
			const savedUser = payload.user;
			if (saveId === userSaveSequence && userSaveKey(appContext.user) === submittedUserKey) {
				lastSavedUserKey = userSaveKey(savedUser);
				LS.set({ userId: savedUser.id });
				appContext.user = savedUser;
			}
			return savedUser;
		},
	});
	setAppContext(appContext);

	let supportsViewTransitions = $state(false);
	let isViewTransitioning = $state(false);
	let settingsMenuState = $state<'closed' | 'open' | 'closing'>('closed');
	let settingsCloseTimer: ReturnType<typeof setTimeout> | undefined;
	let manualViewTransition = false;
	let profileCheckId = 0;
	let lastSavedUserKey = appContext.user.unsaved ? '' : userSaveKey(appContext.user);
	let userSaveSequence = 0;
	const debouncedSaveUser = debounce(() => {
		void appContext.saveUser();
	}, 500);
	const activePath = $derived(page.url.pathname);
	const activeRoomCode = $derived(roomCodeFromPath(activePath));
	const isCreatingRoom = $derived(isCreatingRoomPath(activePath));
	const isBareScreen = $derived(activePath === '/' || activePath === '/setup');
	const isLobbyScreen = $derived(activePath === '/lobby');
	const isRoomScreen = $derived(Boolean(activeRoomCode) || isCreatingRoom);
	const requiresSavedUser = $derived(!isPublicPath(activePath));
	const canRenderRoute = $derived(!requiresSavedUser || !appContext.user.unsaved);
	const setupHref = $derived(setupHrefForReturn(page.url));
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
		const user = data.user;
		if (!user) return;

		lastSavedUserKey = userSaveKey(user);
		appContext.user = user;
	});

	$effect(() => {
		const user = appContext.user;
		scheduleUserSave(user, userSaveKey(user), user.unsaved);
	});

	$effect(() => {
		if (!browser || canRenderRoute) return;
		const setupUrl = setupUrlForReturn(page.url);
		void goto(`${setupUrl.pathname}${setupUrl.search}${setupUrl.hash}`, { noScroll: true });
	});

	onMount(() => {
		supportsViewTransitions = Boolean(document.startViewTransition) && !prefersReducedMotion();
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
			window.clearInterval(presenceInterval);
			if (settingsCloseTimer) clearTimeout(settingsCloseTimer);
			debouncedSaveUser.cancel();
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

	function initialAppUser(): AppUser {
		return (
			data.user ?? {
				id: -1,
				name: 'some soul',
				color: sample(PLAYER_COLOR_PRESETS).id,
				icon: sample(PLAYER_ICON_PRESETS).id,
				unsaved: true,
			}
		);
	}

	function userSaveKey(user: Pick<User, 'id' | 'name' | 'color' | 'icon'>): string {
		return `${user.id}:${user.name}:${user.color}:${user.icon}`;
	}

	function canSaveUser(user: AppUser): user is User {
		return !user.unsaved && isValidPlayerName(user.name);
	}

	function scheduleUserSave(user: AppUser, userKey = userSaveKey(user), unsaved = user.unsaved) {
		if (!browser || unsaved || !isValidPlayerName(user.name) || userKey === lastSavedUserKey) {
			debouncedSaveUser.cancel();
			return;
		}

		debouncedSaveUser();
	}

	async function checkProfileForPath(url: URL) {
		if (!browser) return;

		const path = url.pathname;
		const checkId = ++profileCheckId;
		if (isPublicPath(path)) return;

		try {
			if (checkId !== profileCheckId) return;
			if (appContext.user.unsaved) {
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
			if (appContext.user.id <= 0) return;
			await api.presence.ping({ userId: appContext.user.id });
		} catch {}
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

	function prepareReportIssue(event: MouseEvent) {
		const state = (window as DebugWindow).DEBUG?.getState?.();
		if (state && event.currentTarget instanceof HTMLAnchorElement) {
			const url = new URL(githubIssueUrl);
			url.searchParams.set('body', `\`\`\`json\n${JSON.stringify(state)}\n\`\`\``);
			event.currentTarget.href = url.href;
		}
		closeSettings();
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
			const userId = appContext.user.id;
			if (userId > 0) {
				await api.rooms.action({
					code: roomCode,
					userId,
					action: { type: 'leave', actorId: playerIdForUser(userId) },
				});
			}
		} catch {}
		await goto(`/lobby${page.url.search}${page.url.hash}`, { noScroll: true });
	}

	function roomCodeFromPath(path: string): string | null {
		const match = /^\/room\/([^/]+)$/.exec(path);
		return parseRoomCode(match?.[1]);
	}

	function isCreatingRoomPath(path: string): boolean {
		return path === '/room/new';
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

		if (!appContext.user.unsaved) return url;

		return setupUrlForReturn(url);
	}

	function setupUrlForReturn(returnUrl: URL): URL {
		const setupUrl = new URL('/setup', returnUrl.origin);
		const debugId = debugIdFromUrl(returnUrl);
		const resolvedReturnUrl = debugId && !hasDebugId(returnUrl) ? withDebugId(returnUrl, debugId) : returnUrl;
		const returnPath = `${resolvedReturnUrl.pathname}${resolvedReturnUrl.search}${resolvedReturnUrl.hash}`;
		if (debugId) setupUrl.searchParams.set('DEBUG_ID', debugId);
		if (returnPath !== '/' && !returnUrl.pathname.startsWith('/setup')) {
			setupUrl.searchParams.set('returnTo', returnPath);
		}
		return setupUrl;
	}

	function withPersistentDebugId(url: URL): URL {
		if (!browser || url.origin !== window.location.origin || hasDebugId(url)) return url;

		const debugId = debugIdFromUrl(page.url);
		if (!debugId) return url;

		return withDebugId(url, debugId);
	}

	function setupHrefForReturn(returnUrl: URL): string {
		const setupUrl = setupUrlForReturn(returnUrl);
		return `${setupUrl.pathname}${setupUrl.search}${setupUrl.hash}`;
	}

	function withDebugId(url: URL, debugId: string): URL {
		const next = new URL(url);
		next.searchParams.set('DEBUG_ID', debugId);
		return next;
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
		return Boolean(path && (roomCodeFromPath(path) || isCreatingRoomPath(path)));
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
				{:else if isCreatingRoom}
					<div class="room-code-mark loading">
						<LoaderCircle size={31} strokeWidth={2.5} />
					</div>
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
									<a
										href={githubIssueUrl}
										onclick={prepareReportIssue}
										rel="noreferrer"
										role="menuitem"
										target="_blank"
									>
										<svg fill="currentColor" height="17" viewBox="0 0 24 24" width="17">
											<path
												d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23a11.5 11.5 0 0 1 3-.405c1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
											/>
										</svg>
										<span>Report issue</span>
									</a>
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
					{#if canRenderRoute}
						{@render children()}
					{/if}
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
