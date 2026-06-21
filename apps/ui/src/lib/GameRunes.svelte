<script lang="ts">
	import { gameConfig as config, seededNumber } from '@repo/shared/game';
	import { range } from 'es-toolkit';

	type RuneSize = 'default' | 'panel' | 'card-title' | 'card-body' | 'answer-title' | 'answer-body' | 'clue-body';

	type Props = {
		hash: string;
		words?: number;
		min?: number;
		max?: number;
		size?: RuneSize;
		class?: string;
	};

	let { hash, words = 1, min = 6, max = 20, size = 'default', class: cls }: Props = $props();

	const className = $derived(['rune-word', cls].filter(Boolean).join(' '));

	function wordRunes(): string[][] {
		const seed = seededNumber(hash);
		return range(words).map(wordIndex => {
			const wordSeed = seededNumber(`${hash}:${wordIndex}`);
			const length = min + (wordSeed % (max - min + 1));
			return range(length).map(index => config.runes[(seed + wordIndex * 23 + index * 7) % config.runes.length]);
		});
	}

	function runeStyle(runeHash: string): string {
		const seed = seededNumber(runeHash);
		const direction = seed % 2 ? 1 : -1;
		return [
			`--rune-delay: -${seed % 2600}ms`,
			`--rune-duration: ${2400 + (seed % 900)}ms`,
			`--rune-drift: ${direction}`,
		].join('; ');
	}
</script>

<span class={className} data-size={size}>
	{#each wordRunes() as runeGroup, groupIndex (groupIndex)}
		<span class="rune-group">
			{#each runeGroup as rune, runeIndex (runeIndex)}
				<span class="rune" style={runeStyle(`${hash}:${groupIndex}:${runeIndex}`)}>{rune}</span>
			{/each}
		</span>
	{/each}
</span>

<style>
	.rune-word {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.22em 0.38em;
		max-width: 100%;
		min-width: 0;
		color: color-mix(in oklab, var(--app-accent-strong) 72%, var(--app-focus) 28%);
		font-family: var(--font-mono);
		font-size: 1.22rem;
		font-weight: 800;
		line-height: 1;
		text-shadow:
			0 0 0.45rem color-mix(in oklab, var(--app-accent) 42%, transparent),
			0 0.12rem 0.3rem color-mix(in oklab, black 42%, transparent);
	}

	.rune-word[data-size='panel'] {
		font-size: 1.1rem;
	}

	.rune-word[data-size='card-body'] {
		font-size: 1.06rem;
		line-height: 1.28;
	}

	.rune-word[data-size='answer-title'] {
		font-size: clamp(1.08rem, 3.6vw, 1.52rem);
	}

	.rune-word[data-size='answer-body'] {
		font-size: clamp(1.08rem, 3.2vw, 1.36rem);
		line-height: 1.2;
	}

	.rune-word[data-size='clue-body'] {
		font-size: 1.18rem;
		line-height: 1.28;
	}

	.rune-group {
		display: inline-flex;
		gap: 0.08em;
		max-width: 100%;
		min-width: 0;
	}

	.rune {
		display: inline-block;
		animation: rune-dance calc(var(--rune-duration) * 1.45) ease-in-out infinite;
		animation-delay: var(--rune-delay);
		transform-origin: center 58%;
		will-change: filter, opacity, transform;
	}

	.rune:nth-child(3n + 2) {
		animation-name: rune-swap;
	}

	.rune:nth-child(3n) {
		animation-name: rune-float;
	}

	@keyframes rune-dance {
		0%,
		100% {
			filter: brightness(1);
			opacity: 0.78;
			transform: translate3d(0, 0, 0.2rem) rotate(0deg);
		}
		28% {
			filter: brightness(1.12);
			opacity: 0.96;
			transform: translate3d(calc(var(--rune-drift) * 0.26ch), -0.1rem, 0.45rem) rotate(3deg);
		}
		58% {
			filter: brightness(0.92);
			opacity: 0.86;
			transform: translate3d(calc(var(--rune-drift) * -0.2ch), 0.08rem, 0.24rem) rotate(-3deg);
		}
	}

	@keyframes rune-swap {
		0%,
		100% {
			filter: brightness(0.95);
			opacity: 0.76;
			transform: translate3d(0, 0.04rem, 0.1rem) rotate(0deg);
		}
		35% {
			filter: brightness(1.1);
			opacity: 0.96;
			transform: translate3d(calc(var(--rune-drift) * -0.3ch), -0.07rem, 0.44rem) rotate(-4deg);
		}
		68% {
			filter: brightness(1.02);
			opacity: 0.9;
			transform: translate3d(calc(var(--rune-drift) * 0.24ch), 0.09rem, 0.28rem) rotate(3deg);
		}
	}

	@keyframes rune-float {
		0%,
		100% {
			filter: brightness(1);
			opacity: 0.8;
			transform: translate3d(0, 0, 0.2rem) rotate(0deg) scale(1);
		}
		42% {
			filter: brightness(1.12);
			opacity: 0.96;
			transform: translate3d(calc(var(--rune-drift) * 0.18ch), -0.14rem, 0.48rem) rotate(3deg) scale(1.04);
		}
		72% {
			filter: brightness(0.9);
			opacity: 0.82;
			transform: translate3d(calc(var(--rune-drift) * -0.16ch), 0.07rem, 0.24rem) rotate(-2deg) scale(0.99);
		}
	}

	@media (max-width: 460px) {
		.rune-word[data-size='default'] {
			font-size: 1.03rem;
		}
	}
</style>
