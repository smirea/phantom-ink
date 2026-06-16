<script lang="ts">
	import { BackgroundState } from '$lib/backgroundState.svelte';
	import { LetterGridEngine } from '$lib/letterGridEngine';
	import { onMount } from 'svelte';

	let { state: backgroundState }: { state: BackgroundState } = $props();
	// svelte-ignore state_referenced_locally
	const engine = new LetterGridEngine(backgroundState);
	let now = $state(0);
	let width = $state(0);
	let height = $state(0);
	const visibleCells = $derived.by(() => {
		void now;
		return engine.cells.filter(cell => cell.status !== 'dead');
	});
	const visiblePuffs = $derived.by(() => {
		void now;
		return engine.puffs;
	});

	onMount(() => {
		backgroundState.resetMetrics('svg');
		let frame = 0;
		let lastFrame = 0;
		const updateSize = () => {
			width = window.innerWidth;
			height = window.innerHeight;
		};
		const stopActions = backgroundState.onAction(action => engine.handleAction(action, width, height));

		updateSize();
		window.addEventListener('resize', updateSize);

		const tick = (time: number) => {
			const frameMs = lastFrame === 0 ? 0 : time - lastFrame;
			lastFrame = time;
			const updateStartedAt = performance.now();
			now = time;
			engine.update(time, width, height);
			const finishedAt = performance.now();
			backgroundState.recordFrame(
				'svg',
				frameMs,
				finishedAt - updateStartedAt,
				0,
				engine.cells.length,
				engine.puffs.length,
				time,
			);
			frame = window.requestAnimationFrame(tick);
		};
		frame = window.requestAnimationFrame(tick);

		return () => {
			stopActions();
			window.removeEventListener('resize', updateSize);
			window.cancelAnimationFrame(frame);
		};
	});

	function pop(event: PointerEvent, cellKey: string): void {
		event.preventDefault();
		event.stopPropagation();
		const cell = engine.cells.find(item => item.key === cellKey);
		if (cell) engine.popCell(cell);
	}
</script>

<svg
	class="svg-background"
	data-background-renderer="svg"
	aria-hidden="true"
	viewBox={`0 0 ${width} ${height}`}
	{width}
	{height}
>
	<defs>
		<filter id="background-svg-smoke">
			<feGaussianBlur stdDeviation="5" />
		</filter>
	</defs>

	{#each visibleCells as cell (cell.key)}
		{@const visual = engine.cellVisual(cell, now)}
		<text
			class="svg-letter"
			x="0"
			y="0"
			opacity={visual.alpha}
			transform={`translate(${visual.x} ${visual.y}) rotate(${(visual.spin * 180) / Math.PI}) scale(${visual.scale})`}
			onpointerdown={event => pop(event, cell.key)}
		>
			{cell.char}
		</text>
	{/each}

	{#each visiblePuffs as puff (puff.id)}
		{@const visual = engine.puffVisual(puff, now)}
		<circle
			class="svg-smoke"
			cx="0"
			cy="0"
			r={Math.max(4, visual.pointSize * 0.18)}
			opacity={visual.alpha}
			transform={`translate(${visual.x} ${visual.y}) rotate(${visual.rotation}) scale(${visual.scale})`}
		/>
	{/each}
</svg>

<style>
	.svg-background {
		position: fixed;
		inset: 0;
		z-index: 0;
		display: block;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		pointer-events: none;
	}

	.svg-letter {
		fill: var(--app-muted);
		cursor: pointer;
		dominant-baseline: middle;
		font-family: var(--font-mono);
		font-size: 1.15rem;
		font-weight: 800;
		paint-order: stroke;
		pointer-events: auto;
		text-anchor: middle;
		text-shadow: 0 0 1rem color-mix(in oklab, var(--app-accent) 40%, transparent);
		user-select: none;
	}

	.svg-smoke {
		fill: color-mix(in oklab, var(--app-accent-strong) 48%, var(--app-muted));
		filter: url('#background-svg-smoke');
		pointer-events: none;
	}
</style>
