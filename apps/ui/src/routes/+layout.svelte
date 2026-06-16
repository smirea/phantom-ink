<script lang="ts">
	import BackgroundHost from '$lib/BackgroundHost.svelte';
	import InkButton from '$lib/InkButton.svelte';
	import PhantomLogo from '$lib/PhantomLogo.svelte';
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
		{ href: '/', label: 'Lobby' },
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

	$effect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.dataset.theme = theme;
		setStored(storageKeys.darkMode, theme === 'dark');
	});

	onMount(() => {
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
</script>

<QueryClientProvider client={queryClient}>
	<div class="app-scene">
		<BackgroundHost />

		<section class="content-card">
			<header class="app-header">
				<a class="logo-link" href="/" aria-label="Phantom Ink lobby">
					<PhantomLogo compact />
				</a>
				<InkButton size="sm" onclick={() => (theme = theme === 'dark' ? 'light' : 'dark')}>
					{theme === 'dark' ? 'Light' : 'Dark'}
				</InkButton>
			</header>

			<nav class="screen-nav" aria-label="Mock screens">
				{#each navItems as item}
					<a href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
						{item.label}
					</a>
				{/each}
			</nav>

			{#key activePath}
				<div
					class="route-frame"
					in:fly={{ y: 18, duration: 340, easing: cubicOut }}
					out:fade={{ duration: 130, easing: cubicIn }}
				>
					{@render children()}
				</div>
			{/key}
		</section>
	</div>
</QueryClientProvider>
