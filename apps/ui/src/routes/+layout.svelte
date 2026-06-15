<script lang="ts">
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
	type DriftLetter = {
		char: string;
		x: number;
		y: number;
		vx: number;
		vy: number;
		rotation: number;
		spin: number;
		opacity: number;
		scale: number;
	};

	const navItems = [
		{ href: '/', label: 'Lobby' },
		{ href: '/pad', label: 'Pad' },
		{ href: '/whispers', label: 'Whispers' },
	];
	const glyphs = 'PHANTOMINKSILENCIOSEANCEGHOSTWRITERMOONSUNOBJECTCLUE'.split('');

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser,
			},
		},
	});

	let theme = $state<Theme>(getStored(storageKeys.darkMode) ? 'dark' : 'light');
	let fieldElement = $state<HTMLDivElement | null>(null);
	let contentElement = $state<HTMLElement | null>(null);
	let letters = $state<DriftLetter[]>([]);
	let activePath = $state(typeof location === 'undefined' ? '/' : location.pathname);
	let pointer = { x: -1000, y: -1000 };

	$effect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.dataset.theme = theme;
		setStored(storageKeys.darkMode, theme === 'dark');
	});

	onMount(() => {
		if (!fieldElement) return;

		const createLetters = () => {
			const width = window.innerWidth;
			const height = window.innerHeight;
			letters = Array.from({ length: width < 560 ? 34 : 52 }, (_, index) => ({
				char: glyphs[index % glyphs.length],
				x: Math.random() * width,
				y: Math.random() * height,
				vx: (Math.random() - 0.5) * 0.34,
				vy: (Math.random() - 0.5) * 0.28,
				rotation: Math.random() * 360,
				spin: (Math.random() - 0.5) * 0.16,
				opacity: 0.18 + Math.random() * 0.34,
				scale: 0.78 + Math.random() * 0.66,
			}));
		};

		createLetters();
		let frame = 0;
		let lastResize = window.innerWidth;

		const tick = () => {
			const width = window.innerWidth;
			const height = window.innerHeight;
			const card = contentElement?.getBoundingClientRect();

			if (Math.abs(width - lastResize) > 80) {
				lastResize = width;
				createLetters();
			}

			for (const letter of letters) {
				const dx = letter.x - pointer.x;
				const dy = letter.y - pointer.y;
				const distance = Math.hypot(dx, dy);
				if (distance < 160) {
					const push = (160 - distance) / 160;
					const safeDistance = distance || 1;
					letter.vx += (dx / safeDistance) * push * 0.055;
					letter.vy += (dy / safeDistance) * push * 0.055;
				}

				letter.x += letter.vx;
				letter.y += letter.vy;
				letter.rotation += letter.spin;
				letter.vx *= 0.992;
				letter.vy *= 0.992;
				letter.opacity += (0.35 - letter.opacity) * 0.012;

				if (letter.x < -16 || letter.x > width + 16) {
					letter.vx *= -0.76;
					letter.x = Math.max(-16, Math.min(width + 16, letter.x));
				}

				if (letter.y < -16 || letter.y > height + 16) {
					letter.vy *= -0.76;
					letter.y = Math.max(-16, Math.min(height + 16, letter.y));
				}

				if (
					card &&
					letter.x > card.left - 18 &&
					letter.x < card.right + 18 &&
					letter.y > card.top - 18 &&
					letter.y < card.bottom + 18
				) {
					const leftPush = Math.abs(letter.x - card.left);
					const rightPush = Math.abs(letter.x - card.right);
					const topPush = Math.abs(letter.y - card.top);
					const bottomPush = Math.abs(letter.y - card.bottom);
					const side = Math.min(leftPush, rightPush, topPush, bottomPush);

					if (side === leftPush) {
						letter.x = card.left - 20;
						letter.vx = -Math.abs(letter.vx || 0.42);
					} else if (side === rightPush) {
						letter.x = card.right + 20;
						letter.vx = Math.abs(letter.vx || 0.42);
					} else if (side === topPush) {
						letter.y = card.top - 20;
						letter.vy = -Math.abs(letter.vy || 0.34);
					} else {
						letter.y = card.bottom + 20;
						letter.vy = Math.abs(letter.vy || 0.34);
					}

					letter.opacity = 0.06;
				}
			}

			frame = window.requestAnimationFrame(tick);
		};

		frame = window.requestAnimationFrame(tick);
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
			window.cancelAnimationFrame(frame);
			history.pushState = pushState;
			history.replaceState = replaceState;
			window.removeEventListener('popstate', updatePath);
		};
	});

	function handlePointerMove(event: PointerEvent): void {
		pointer = { x: event.clientX, y: event.clientY };
	}

	function isActive(href: string): boolean {
		return href === '/' ? activePath === '/' : activePath.startsWith(href);
	}
</script>

<QueryClientProvider client={queryClient}>
	<div class="app-scene" onpointermove={handlePointerMove}>
		<div class="letter-field" aria-hidden="true" bind:this={fieldElement}>
			{#each letters as letter}
				<span
					style={`--x:${letter.x}px; --y:${letter.y}px; --r:${letter.rotation}deg; --o:${letter.opacity}; --s:${letter.scale};`}
				>
					{letter.char}
				</span>
			{/each}
		</div>

		<section class="content-card" bind:this={contentElement}>
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
