<script lang="ts">
	import { innerWidth, innerHeight } from 'svelte/reactivity/window';
	import * as _ from 'es-toolkit';

	const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
	const minSpacing = 30;
	const rotationSpeed = { min: 0.5, max: 4 } as const;

	const config = $state({
		spacing: 50,
		direction: 30,
	});

	const grid = $state<Array<Array<{ letter: string; rotationSpeed: number }>>>([]);

	updateGrid();

	function updateGrid() {
		const maxX = Math.ceil((innerWidth.current || 0) / minSpacing);
		const maxY = Math.ceil((innerHeight.current || 0) / minSpacing);
		for (let y = 0; y < maxY; ++y) {
			if (!grid[y]) grid.push([]);
			for (let x = 0; x < maxX; ++x) {
				if (grid[y][x]) continue;
				grid[y].push({
					letter: _.sample(letters),
					rotationSpeed: _.round(_.random(rotationSpeed.min, rotationSpeed.max), 1),
				});
			}
		}
	}

	function getMoveDurations(angleDeg: number, totalTime = 5) {
		const rad = (angleDeg * Math.PI) / 180;
		const cos = Math.abs(Math.cos(rad));
		const sin = Math.abs(Math.sin(rad));

		const effectivelyInfinite = 1e6;
		const tx = cos === 0 ? effectivelyInfinite : totalTime / cos;
		const ty = sin === 0 ? effectivelyInfinite : totalTime / sin;

		return `--t-move-x: ${tx.toFixed(2)}s; --t-move-y: ${ty.toFixed(2)}s;`;
	}
</script>

<div class="root">
	{#each [-1, 0, 1] as x}
		{#each [-1, 0, 1] as y}
			<div
				class="tile"
				data-x={x}
				data-y={y}
				style="top: calc({y} * 100vh); left:calc({x} * 100vw); {getMoveDurations(0, 2)}"
			>
				{#each grid as gridRows, gY}
					{#each gridRows as item, gX}
						<div
							class="letter"
							style="--t-rotate: {item.rotationSpeed}s; top: {gY * minSpacing}px; left: {gX * minSpacing}px"
						>
							{item.letter}
						</div>
					{/each}
				{/each}
			</div>
		{/each}
	{/each}
</div>

<style>
	.root {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
	}

	.letter {
		position: absolute;
		left: 50%;
		font-size: 2rem;
		font-weight: bold;
		/* animation: rotate var(--t-rotate) linear infinite; */
		transform-origin: center center;
		user-select: none;
		pointer-events: none;
	}

	@property --tx {
		syntax: '<length>';
		initial-value: 0px;
		inherits: false;
	}

	@property --ty {
		syntax: '<length>';
		initial-value: 0px;
		inherits: false;
	}

	.tile {
		position: absolute;
		width: 100vw;
		height: 100vh;
		animation:
			moveX var(--t-move-x) linear infinite,
			moveY var(--t-move-y) linear infinite;
		transform: translate(var(--tx), var(--ty));
	}

	@keyframes moveX {
		from {
			--tx: 0;
		}
		to {
			--tx: 100vw;
		}
	}

	@keyframes moveY {
		from {
			--ty: 0;
		}
		to {
			--ty: 100vh;
		}
	}

	@keyframes rotate {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
