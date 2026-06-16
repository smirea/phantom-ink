<script lang="ts">
	import { BackgroundState } from '$lib/backgroundState.svelte';
	import { LetterGridEngine } from '$lib/letterGridEngine';
	import { onMount } from 'svelte';

	let { state: backgroundState }: { state: BackgroundState } = $props();
	let root: HTMLDivElement | undefined = undefined;
	// svelte-ignore state_referenced_locally
	const engine = new LetterGridEngine(backgroundState);
	const cellElements = new Map<string, HTMLSpanElement>();
	const puffElements = new Map<number, HTMLSpanElement>();

	onMount(() => {
		if (!root) return;
		backgroundState.resetMetrics('dom-imperative');

		let frame = 0;
		let lastFrame = 0;
		const stopActions = backgroundState.onAction(action =>
			engine.handleAction(action, window.innerWidth, window.innerHeight),
		);

		const tick = (now: number) => {
			const frameMs = lastFrame === 0 ? 0 : now - lastFrame;
			lastFrame = now;
			const updateStartedAt = performance.now();
			engine.update(now, window.innerWidth, window.innerHeight);
			const drawStartedAt = performance.now();
			syncCells(now);
			syncPuffs(now);
			const finishedAt = performance.now();
			backgroundState.recordFrame(
				'dom-imperative',
				frameMs,
				drawStartedAt - updateStartedAt,
				finishedAt - drawStartedAt,
				engine.cells.length,
				engine.puffs.length,
				now,
			);
			frame = window.requestAnimationFrame(tick);
		};
		frame = window.requestAnimationFrame(tick);

		return () => {
			stopActions();
			window.cancelAnimationFrame(frame);
			cellElements.clear();
			puffElements.clear();
		};
	});

	function syncCells(now: number): void {
		if (!root) return;
		for (const cell of engine.cells) {
			let element = cellElements.get(cell.key);
			if (!element) {
				element = document.createElement('span');
				element.className = 'dom-direct-letter';
				element.addEventListener('pointerdown', event => {
					event.preventDefault();
					event.stopPropagation();
					engine.popCell(cell);
				});
				root.appendChild(element);
				cellElements.set(cell.key, element);
			}

			if (cell.status === 'dead') {
				element.style.display = 'none';
				continue;
			}

			const visual = engine.cellVisual(cell, now);
			element.textContent = cell.char;
			element.style.display = 'grid';
			element.style.opacity = `${visual.alpha}`;
			element.style.fontSize = `${Math.max(12, engine.spacing.current * 0.34)}px`;
			element.style.transform = `translate3d(${visual.x}px, ${visual.y}px, 0) translate(-50%, -50%) rotate(${visual.spin}rad) scale(${visual.scale})`;
		}
	}

	function syncPuffs(now: number): void {
		if (!root) return;
		const activeIds = new Set(engine.puffs.map(puff => puff.id));

		for (const [id, element] of puffElements) {
			if (activeIds.has(id)) continue;
			element.remove();
			puffElements.delete(id);
		}

		for (const puff of engine.puffs) {
			let element = puffElements.get(puff.id);
			if (!element) {
				element = document.createElement('span');
				element.className = 'dom-direct-smoke';
				root.appendChild(element);
				puffElements.set(puff.id, element);
			}

			const visual = engine.puffVisual(puff, now);
			element.style.opacity = `${visual.alpha}`;
			element.style.width = `${Math.max(12, visual.pointSize * 0.38)}px`;
			element.style.transform = `translate3d(${visual.x}px, ${visual.y}px, 0) translate(-50%, -50%) rotate(${visual.rotation}deg) scale(${visual.scale})`;
		}
	}
</script>

<div bind:this={root} class="dom-direct-background" data-background-renderer="dom-imperative" aria-hidden="true"></div>

<style>
	.dom-direct-background {
		position: fixed;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		pointer-events: none;
		contain: layout style paint;
	}

	:global(.dom-direct-letter) {
		position: absolute;
		left: 0;
		top: 0;
		display: grid;
		width: 3rem;
		aspect-ratio: 1;
		place-items: center;
		color: var(--app-muted);
		cursor: pointer;
		font-family: var(--font-mono);
		font-weight: 800;
		line-height: 1;
		pointer-events: auto;
		text-shadow: 0 0 1rem color-mix(in oklab, var(--app-accent) 40%, transparent);
		transform-origin: center;
		user-select: none;
		will-change: transform, opacity;
	}

	:global(.dom-direct-smoke) {
		position: absolute;
		left: 0;
		top: 0;
		z-index: 2;
		aspect-ratio: 1;
		border-radius: 999px;
		background:
			radial-gradient(circle, color-mix(in oklab, var(--app-accent-strong) 52%, transparent) 0 18%, transparent 64%),
			radial-gradient(circle, color-mix(in oklab, var(--app-muted) 42%, transparent) 0 42%, transparent 72%);
		filter: blur(0.38rem);
		pointer-events: none;
		will-change: transform, opacity;
	}
</style>
