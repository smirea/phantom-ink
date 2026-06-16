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
		id: number;
		char: string;
		x: number;
		y: number;
		vx: number;
		vy: number;
		rotation: number;
		spin: number;
		opacity: number;
		targetOpacity: number;
		scale: number;
		radius: number;
		minSpeed: number;
		velocityDelta: number;
		repel: number;
		pointerRepel: number;
		contentBounce: number;
		fadeSpeed: number;
		fadeDelay: number;
		hiddenFor: number;
		hitCooldown: number;
	};
	type SmokePuff = {
		id: number;
		x: number;
		y: number;
		vx: number;
		vy: number;
		rotation: number;
		spin: number;
		opacity: number;
		baseOpacity: number;
		scale: number;
		growth: number;
		age: number;
		ttl: number;
	};

	const navItems = [
		{ href: '/', label: 'Lobby' },
		{ href: '/pad', label: 'Pad' },
		{ href: '/whispers', label: 'Whispers' },
	];
	const glyphs = 'PHANTOMINKSILENCIOSEANCEGHOSTWRITERMOONSUNOBJECTCLUE'.split('');
	const pointerAway = { x: -1000, y: -1000 };

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
	let puffs = $state<SmokePuff[]>([]);
	let activePath = $state(typeof location === 'undefined' ? '/' : location.pathname);
	let pointer = pointerAway;
	let smokeId = 0;
	let flowAngle = Math.random() * Math.PI * 2;

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
			letters = Array.from({ length: width < 560 ? 38 : 62 }, (_, index) => createLetter(index, width, height));
		};

		createLetters();
		let frame = 0;
		let lastTime = performance.now();
		let lastResize = window.innerWidth;
		let lastHeight = window.innerHeight;

		const tick = (now: number) => {
			const dt = Math.min(2.4, Math.max(0.35, (now - lastTime) / 16.67));
			lastTime = now;
			const width = window.innerWidth;
			const height = window.innerHeight;
			const card = contentElement?.getBoundingClientRect();

			if (Math.abs(width - lastResize) > 80 || Math.abs(height - lastHeight) > 80) {
				lastResize = width;
				lastHeight = height;
				createLetters();
			}

			flowAngle += 0.00035 * dt;
			const flowX = Math.cos(flowAngle);
			const flowY = Math.sin(flowAngle);
			applyLetterRepulsion(dt, width, height);

			for (const letter of letters) {
				if (letter.hiddenFor > 0) {
					letter.hiddenFor -= 16.67 * dt;
					if (letter.hiddenFor <= 0) resetLetter(letter, width, height);
					continue;
				}

				if (letter.hitCooldown > 0) letter.hitCooldown -= 16.67 * dt;
				letter.fadeDelay -= 16.67 * dt;
				if (letter.fadeDelay <= 0) {
					letter.targetOpacity = randomBetween(0.08, 0.48);
					letter.fadeDelay = randomBetween(800, 3200);
				}

				const dx = letter.x - pointer.x;
				const dy = letter.y - pointer.y;
				const distance = Math.hypot(dx, dy);
				const pointerRange = 118 + letter.pointerRepel * 56;
				if (distance < pointerRange) {
					const push = (pointerRange - distance) / pointerRange;
					const safeDistance = distance || 1;
					letter.vx += (dx / safeDistance) * push * 0.048 * letter.pointerRepel * dt;
					letter.vy += (dy / safeDistance) * push * 0.048 * letter.pointerRepel * dt;
				}

				letter.vx += flowX * 0.0056 * letter.velocityDelta * dt;
				letter.vy += flowY * 0.0056 * letter.velocityDelta * dt;
				letter.vx *= 0.991;
				letter.vy *= 0.991;
				keepLetterMoving(letter, flowX, flowY);

				if (
					card &&
					letter.x > card.left - letter.radius &&
					letter.x < card.right + letter.radius &&
					letter.y > card.top - letter.radius &&
					letter.y < card.bottom + letter.radius
				) {
					bounceFromContent(letter, card);
				}

				letter.x += letter.vx * dt;
				letter.y += letter.vy * dt;
				letter.rotation += letter.spin * dt;
				letter.opacity += (letter.targetOpacity - letter.opacity) * Math.min(0.12, letter.fadeSpeed * dt);
				wrapLetter(letter, width, height);
			}

			updatePuffs(dt);
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

	function handlePointerLeave(): void {
		pointer = pointerAway;
	}

	function createLetter(index: number, width: number, height: number): DriftLetter {
		const angle = flowAngle + randomBetween(-0.72, 0.72);
		const speed = randomBetween(0.16, 0.48);
		const opacity = randomBetween(0.08, 0.42);

		return {
			id: index,
			char: glyphs[Math.floor(Math.random() * glyphs.length)],
			x: Math.random() * width,
			y: Math.random() * height,
			vx: Math.cos(angle) * speed + randomBetween(-0.08, 0.08),
			vy: Math.sin(angle) * speed + randomBetween(-0.08, 0.08),
			rotation: Math.random() * 360,
			spin: randomBetween(-0.18, 0.18),
			opacity,
			targetOpacity: randomBetween(0.08, 0.48),
			scale: randomBetween(0.78, 1.5),
			radius: randomBetween(16, 28),
			minSpeed: randomBetween(0.12, 0.26),
			velocityDelta: randomBetween(0.74, 1.38),
			repel: randomBetween(0.62, 1.44),
			pointerRepel: randomBetween(0.72, 1.46),
			contentBounce: randomBetween(0.82, 1.28),
			fadeSpeed: randomBetween(0.012, 0.034),
			fadeDelay: randomBetween(400, 2600),
			hiddenFor: 0,
			hitCooldown: 0,
		};
	}

	function resetLetter(letter: DriftLetter, width: number, height: number): void {
		const next = createLetter(letter.id, width, height);
		const side = Math.floor(Math.random() * 4);
		if (side === 0) {
			next.x = -next.radius;
		} else if (side === 1) {
			next.x = width + next.radius;
		} else if (side === 2) {
			next.y = -next.radius;
		} else {
			next.y = height + next.radius;
		}
		next.opacity = 0;
		Object.assign(letter, next);
	}

	function applyLetterRepulsion(dt: number, width: number, height: number): void {
		for (let aIndex = 0; aIndex < letters.length; aIndex += 1) {
			const a = letters[aIndex];
			if (a.hiddenFor > 0) continue;

			for (let bIndex = aIndex + 1; bIndex < letters.length; bIndex += 1) {
				const b = letters[bIndex];
				if (b.hiddenFor > 0) continue;

				let dx = b.x - a.x;
				let dy = b.y - a.y;
				if (dx > width / 2) dx -= width;
				if (dx < -width / 2) dx += width;
				if (dy > height / 2) dy -= height;
				if (dy < -height / 2) dy += height;

				const distance = Math.hypot(dx, dy) || 1;
				const range = 34 + (a.radius + b.radius) * 0.52;
				if (distance >= range) continue;

				const push = ((range - distance) / range) * 0.0075 * (a.repel + b.repel) * dt;
				const nx = dx / distance;
				const ny = dy / distance;
				a.vx -= nx * push * b.repel;
				a.vy -= ny * push * b.repel;
				b.vx += nx * push * a.repel;
				b.vy += ny * push * a.repel;
			}
		}
	}

	function keepLetterMoving(letter: DriftLetter, flowX: number, flowY: number): void {
		const speed = Math.hypot(letter.vx, letter.vy);
		if (speed < letter.minSpeed) {
			const angle = speed > 0.001 ? Math.atan2(letter.vy, letter.vx) : Math.atan2(flowY, flowX);
			letter.vx = Math.cos(angle) * letter.minSpeed;
			letter.vy = Math.sin(angle) * letter.minSpeed;
		}

		const maxSpeed = 1.32 + letter.velocityDelta * 0.34;
		if (speed > maxSpeed) {
			letter.vx = (letter.vx / speed) * maxSpeed;
			letter.vy = (letter.vy / speed) * maxSpeed;
		}
	}

	function bounceFromContent(letter: DriftLetter, card: DOMRect): void {
		const puffX = Math.max(card.left, Math.min(card.right, letter.x));
		const puffY = Math.max(card.top, Math.min(card.bottom, letter.y));
		const leftPush = Math.abs(letter.x - card.left);
		const rightPush = Math.abs(letter.x - card.right);
		const topPush = Math.abs(letter.y - card.top);
		const bottomPush = Math.abs(letter.y - card.bottom);
		const side = Math.min(leftPush, rightPush, topPush, bottomPush);

		if (letter.hitCooldown <= 0) {
			spawnSmoke(puffX, puffY, 7, 0.82);
			letter.hitCooldown = randomBetween(420, 780);
		}

		if (side === leftPush) {
			letter.x = card.left - letter.radius;
			letter.vx = -Math.max(Math.abs(letter.vx) * letter.contentBounce, letter.minSpeed + 0.08);
		} else if (side === rightPush) {
			letter.x = card.right + letter.radius;
			letter.vx = Math.max(Math.abs(letter.vx) * letter.contentBounce, letter.minSpeed + 0.08);
		} else if (side === topPush) {
			letter.y = card.top - letter.radius;
			letter.vy = -Math.max(Math.abs(letter.vy) * letter.contentBounce, letter.minSpeed + 0.08);
		} else {
			letter.y = card.bottom + letter.radius;
			letter.vy = Math.max(Math.abs(letter.vy) * letter.contentBounce, letter.minSpeed + 0.08);
		}

		letter.opacity = 0.02;
		letter.targetOpacity = randomBetween(0.1, 0.32);
	}

	function wrapLetter(letter: DriftLetter, width: number, height: number): void {
		const edge = letter.radius + 12;
		if (letter.x < -edge) letter.x = width + edge;
		if (letter.x > width + edge) letter.x = -edge;
		if (letter.y < -edge) letter.y = height + edge;
		if (letter.y > height + edge) letter.y = -edge;
	}

	function vanishLetter(id: number, event: PointerEvent): void {
		event.preventDefault();
		event.stopPropagation();
		const letter = letters.find(item => item.id === id);
		if (!letter || letter.hiddenFor > 0) return;

		spawnSmoke(letter.x, letter.y, 14, 1.24);
		letter.opacity = 0;
		letter.targetOpacity = 0;
		letter.hiddenFor = randomBetween(640, 1200);
	}

	function spawnSmoke(x: number, y: number, count: number, intensity: number): void {
		const nextPuffs = Array.from({ length: count }, () => {
			const angle = Math.random() * Math.PI * 2;
			const speed = randomBetween(0.16, 0.76) * intensity;
			return {
				id: (smokeId += 1),
				x,
				y,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed - randomBetween(0.02, 0.18),
				rotation: Math.random() * 360,
				spin: randomBetween(-0.42, 0.42),
				opacity: 0,
				baseOpacity: randomBetween(0.2, 0.48),
				scale: randomBetween(0.42, 1.1) * intensity,
				growth: randomBetween(0.012, 0.034) * intensity,
				age: 0,
				ttl: randomBetween(560, 1180),
			};
		});
		puffs = [...puffs.slice(-84), ...nextPuffs];
	}

	function updatePuffs(dt: number): void {
		for (const puff of puffs) {
			puff.age += 16.67 * dt;
			const progress = Math.min(1, puff.age / puff.ttl);
			puff.x += puff.vx * dt;
			puff.y += puff.vy * dt;
			puff.rotation += puff.spin * dt;
			puff.scale += puff.growth * dt;
			puff.opacity = puff.baseOpacity * Math.sin(progress * Math.PI) * (1 - progress * 0.34);
		}
		puffs = puffs.filter(puff => puff.age < puff.ttl);
	}

	function randomBetween(min: number, max: number): number {
		return min + Math.random() * (max - min);
	}

	function isActive(href: string): boolean {
		return href === '/' ? activePath === '/' : activePath.startsWith(href);
	}
</script>

<QueryClientProvider client={queryClient}>
	<div class="app-scene" onpointermove={handlePointerMove} onpointerleave={handlePointerLeave}>
		<div class="letter-field" aria-hidden="true" bind:this={fieldElement}>
			{#each letters as letter (letter.id)}
				<span
					class="drift-letter"
					onpointerdown={event => vanishLetter(letter.id, event)}
					style={`--x:${letter.x}px; --y:${letter.y}px; --r:${letter.rotation}deg; --o:${letter.opacity}; --s:${letter.scale};`}
				>
					{letter.char}
				</span>
			{/each}
			{#each puffs as puff (puff.id)}
				<span
					class="smoke-puff"
					style={`--x:${puff.x}px; --y:${puff.y}px; --r:${puff.rotation}deg; --o:${puff.opacity}; --s:${puff.scale};`}
				></span>
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
