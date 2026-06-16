<script lang="ts">
	import { BackgroundState } from '$lib/backgroundState.svelte';
	import { LetterGridEngine } from '$lib/letterGridEngine';
	import { onMount } from 'svelte';

	let { state: backgroundState }: { state: BackgroundState } = $props();
	let canvas: HTMLCanvasElement | undefined = undefined;
	// svelte-ignore state_referenced_locally
	const engine = new LetterGridEngine(backgroundState);

	onMount(() => {
		if (!canvas) return;
		backgroundState.resetMetrics('canvas-2d');
		const context = canvas.getContext('2d', { alpha: true });
		if (!context) return;

		let frame = 0;
		const stopActions = backgroundState.onAction(action =>
			engine.handleAction(action, window.innerWidth, window.innerHeight),
		);
		const resize = () => resizeCanvas(canvas!, context);
		let lastFrame = 0;

		resize();
		window.addEventListener('resize', resize);

		const tick = (now: number) => {
			const frameMs = lastFrame === 0 ? 0 : now - lastFrame;
			lastFrame = now;
			const updateStartedAt = performance.now();
			engine.update(now, window.innerWidth, window.innerHeight);
			const drawStartedAt = performance.now();
			draw(context, now);
			const finishedAt = performance.now();
			backgroundState.recordFrame(
				'canvas-2d',
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
			window.removeEventListener('resize', resize);
			window.cancelAnimationFrame(frame);
		};
	});

	function resizeCanvas(target: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
		const ratio = window.devicePixelRatio || 1;
		const width = window.innerWidth;
		const height = window.innerHeight;
		target.width = Math.ceil(width * ratio);
		target.height = Math.ceil(height * ratio);
		target.style.width = `${width}px`;
		target.style.height = `${height}px`;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
	}

	function draw(context: CanvasRenderingContext2D, now: number): void {
		const width = window.innerWidth;
		const height = window.innerHeight;
		const styles = getComputedStyle(document.documentElement);
		const textColor = styles.getPropertyValue('--app-muted').trim();
		const accentColor = styles.getPropertyValue('--app-accent-strong').trim();
		const fontFamily = styles.getPropertyValue('--font-mono').trim() || 'monospace';

		context.clearRect(0, 0, width, height);
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillStyle = textColor;
		context.shadowColor = accentColor;
		context.shadowBlur = 12;

		for (const cell of engine.cells) {
			if (cell.status === 'dead') continue;
			const visual = engine.cellVisual(cell, now);
			if (visual.alpha <= 0.001) continue;
			context.save();
			context.globalAlpha = visual.alpha;
			context.translate(visual.x, visual.y);
			context.rotate(visual.spin);
			context.scale(visual.scale, visual.scale);
			context.font = `800 ${Math.max(12, engine.spacing.current * 0.34)}px ${fontFamily}`;
			context.fillText(cell.char, 0, 0);
			context.restore();
		}

		context.shadowBlur = 0;
		for (const puff of engine.puffs) {
			const visual = engine.puffVisual(puff, now);
			if (visual.alpha <= 0.001) continue;
			const radius = Math.max(4, visual.pointSize * 0.22);
			const gradient = context.createRadialGradient(visual.x, visual.y, 0, visual.x, visual.y, radius);
			gradient.addColorStop(0, accentColor);
			gradient.addColorStop(0.42, textColor);
			gradient.addColorStop(1, 'transparent');
			context.save();
			context.globalAlpha = visual.alpha;
			context.translate(visual.x, visual.y);
			context.rotate((visual.rotation * Math.PI) / 180);
			context.scale(visual.scale, visual.scale);
			context.filter = 'blur(5px)';
			context.fillStyle = gradient;
			context.beginPath();
			context.arc(0, 0, radius, 0, Math.PI * 2);
			context.fill();
			context.restore();
		}
		context.filter = 'none';
	}

	function handlePointer(event: PointerEvent): void {
		engine.popAt(event.clientX, event.clientY);
	}
</script>

<canvas
	bind:this={canvas}
	class="canvas-background"
	data-background-renderer="canvas-2d"
	aria-hidden="true"
	onpointerdown={handlePointer}
></canvas>

<style>
	.canvas-background {
		position: fixed;
		inset: 0;
		z-index: 0;
		display: block;
		width: 100vw;
		height: 100vh;
		pointer-events: auto;
	}
</style>
