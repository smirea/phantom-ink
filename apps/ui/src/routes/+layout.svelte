<script lang="ts">
	import BackgroundHost from '$lib/BackgroundHost.svelte';
	import InkButton from '$lib/InkButton.svelte';
	import PhantomLogo from '$lib/PhantomLogo.svelte';
	import { onNavigate } from '$app/navigation';
	import { getStored, setStored, storageKeys } from '$lib/storage';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { onMount } from 'svelte';
	import { cubicIn, cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
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

	let theme = $state<Theme>(getStored(storageKeys.darkMode) ? 'dark' : 'light');
	let activePath = $state(typeof location === 'undefined' ? '/' : location.pathname);
	let supportsViewTransitions = $state(false);
	let isViewTransitioning = $state(false);
	const isStartScreen = $derived(activePath === '/');
	const fallbackIn = $derived(
		supportsViewTransitions ? { y: 0, duration: 0 } : { y: 18, duration: 320, easing: cubicOut },
	);
	const fallbackOut = $derived(supportsViewTransitions ? { duration: 0 } : { duration: 140, easing: cubicIn });

	onNavigate(navigation => {
		if (!browser || !supportsViewTransitions) return;

		const fromPath = navigation.from?.url.pathname;
		const toPath = navigation.to?.url.pathname;
		if (fromPath === '/' || toPath === '/') {
			document.documentElement.dataset.logoTransition = 'letters';
		}

		isViewTransitioning = true;
		return new Promise<void>(resolve => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			transition.finished.finally(() => {
				isViewTransitioning = false;
				delete document.documentElement.dataset.logoTransition;
			});
		});
	});

	$effect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.dataset.theme = theme;
		setStored(storageKeys.darkMode, theme === 'dark');
	});

	onMount(() => {
		supportsViewTransitions = Boolean(document.startViewTransition) && !prefersReducedMotion();
		const updatePath = () => (activePath = window.location.pathname);
		const pushState = history.pushState;
		const replaceState = history.replaceState;

		history.pushState = function pushStateAndUpdate(...args) {
			pushState.apply(this, args);
			updatePath();
		};
		history.replaceState = function replaceStateAndUpdate(...args) {
			replaceState.apply(this, args);
			updatePath();
		};
		window.addEventListener('popstate', updatePath);

		return () => {
			history.pushState = pushState;
			history.replaceState = replaceState;
			window.removeEventListener('popstate', updatePath);
		};
	});

	function isActive(href: string): boolean {
		return href === '/' ? activePath === '/' : activePath.startsWith(href);
	}

	function prefersReducedMotion(): boolean {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}
</script>

<QueryClientProvider client={queryClient}>
	<div class:view-transitioning={isViewTransitioning} class="app-scene">
		<BackgroundHost />

		{#if isStartScreen}
			{@render children()}
		{:else}
			<div class="screen-shell" in:fly={fallbackIn} out:fade={fallbackOut}>
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
						<div class="route-frame" in:fly={fallbackIn} out:fade={fallbackOut}>
							{@render children()}
						</div>
					{/key}
				</section>
			</div>
		{/if}
	</div>
</QueryClientProvider>
