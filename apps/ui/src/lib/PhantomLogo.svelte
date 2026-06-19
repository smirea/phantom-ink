<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		compact = false,
		textOnly = false,
		class: cls,
		...rest
	}: HTMLAttributes<HTMLDivElement> & { compact?: boolean; textOnly?: boolean } = $props();

	const letters = Array.from('Phantom Ink').map((char, index) => ({
		char,
		index,
		style: `--letter-index: ${index}`,
	}));
</script>

<div class:compact class:text-only={textOnly} class={['phantom-logo', cls]} role="img" aria-label="Phantom Ink">
	<span class="logo-text" aria-hidden="true">
		{#each letters as letter}
			<span
				class:logo-space={letter.char === ' '}
				class="logo-letter"
				data-letter-index={letter.index}
				style={letter.style}
			>
				{letter.char === ' ' ? '\u00a0' : letter.char}
			</span>
		{/each}
	</span>

	{#if !textOnly}
		<svg class="logo-art" viewBox="0 0 520 220" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
			<defs>
				<filter id="logo-shadow" x="-12%" y="-18%" width="124%" height="140%">
					<feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="var(--logo-shadow)" flood-opacity="0.34" />
				</filter>
				<linearGradient id="pen-metal" x1="52" x2="468" y1="142" y2="176" gradientUnits="userSpaceOnUse">
					<stop offset="0" stop-color="var(--logo-metal-light)" />
					<stop offset="0.48" stop-color="var(--logo-metal)" />
					<stop offset="1" stop-color="var(--logo-metal-deep)" />
				</linearGradient>
			</defs>

			<g class="logo-rays">
				<path d="M260 112V12" />
				<path d="M226 118 168 22" />
				<path d="M294 118 352 22" />
				<path d="M195 130 82 44" />
				<path d="M325 130 438 44" />
				<path d="M176 154 34 126" />
				<path d="M344 154 486 126" />
			</g>

			<g filter="url(#logo-shadow)">
				<g class="pen">
					<path class="pen-body" d="M54 158 216 135 232 156 216 177 54 177Z" />
					<path class="pen-body" d="M304 135 431 148 431 168 304 177 288 156Z" />
					<path class="pen-nib" d="M428 146 490 157 428 169Z" />
					<path class="pen-cut" d="M436 157H472" />
					<path class="pen-cut" d="M444 153c7 5 7 4 14 0" />
					<path class="pen-cut" d="M88 155c8 8 16 8 24 0s16-8 24 0" />
					<path class="pen-cut" d="M150 146v24" />
					<path class="pen-cut" d="M174 142v28" />
					<path class="pen-cut" d="M332 144c8 8 16 8 24 0s16-8 24 0" />
					<circle class="pen-star" cx="72" cy="164" r="3" />
					<circle class="pen-star" cx="196" cy="151" r="3" />
					<circle class="pen-star" cx="398" cy="158" r="3" />
				</g>

				<g class="eye-mark">
					<path class="diamond-shadow" d="M260 115 315 156 260 197 205 156Z" />
					<path class="diamond" d="M260 121 307 156 260 191 213 156Z" />
					<path class="eye" d="M224 156c18-18 54-18 72 0-18 19-54 19-72 0Z" />
					<circle class="iris" cx="260" cy="156" r="13" />
					<circle class="pupil" cx="260" cy="156" r="6" />
					<path class="eye-line" d="M235 155c16-9 34-9 50 0" />
					<path class="eye-line lower" d="M239 162c13 8 29 8 42 0" />
				</g>
			</g>
		</svg>
	{/if}
</div>

<style>
	.phantom-logo {
		position: relative;
		display: block;
		width: min(28rem, 100%);
		aspect-ratio: 520 / 220;
		color: var(--logo-word);
		overflow: visible;
	}

	.phantom-logo.compact {
		width: min(10.5rem, 100%);
	}

	.phantom-logo.text-only {
		width: fit-content;
		max-width: 100%;
		aspect-ratio: auto;
		line-height: 1;
	}

	.logo-text {
		position: absolute;
		top: 15%;
		left: 50%;
		z-index: 1;
		display: inline-flex;
		align-items: baseline;
		width: max-content;
		max-width: 100%;
		color: var(--logo-word);
		font-family: var(--font-fancy);
		font-size: clamp(2.8rem, 12vw, 4.35rem);
		font-weight: 900;
		letter-spacing: 0;
		line-height: 0.9;
		text-align: center;
		transform: translateX(-50%);
	}

	.logo-letter {
		display: inline-block;
		text-shadow:
			0 0 0.12em var(--logo-word-stroke),
			0.035em 0.07em 0 var(--logo-word-stroke),
			0 0.12em 0.18em var(--logo-shadow);
		-webkit-text-stroke: 0.055em var(--logo-word-stroke);
		paint-order: stroke fill;
		transform-origin: 50% 62%;
	}

	.logo-space {
		width: 0.34em;
		-webkit-text-stroke: 0;
	}

	:global(html[data-logo-transition='letters']) .logo-letter[data-letter-index='0'] {
		view-transition-name: phantom-logo-letter-0;
	}

	:global(html[data-logo-transition='letters']) .logo-letter[data-letter-index='1'] {
		view-transition-name: phantom-logo-letter-1;
	}

	:global(html[data-logo-transition='letters']) .logo-letter[data-letter-index='2'] {
		view-transition-name: phantom-logo-letter-2;
	}

	:global(html[data-logo-transition='letters']) .logo-letter[data-letter-index='3'] {
		view-transition-name: phantom-logo-letter-3;
	}

	:global(html[data-logo-transition='letters']) .logo-letter[data-letter-index='4'] {
		view-transition-name: phantom-logo-letter-4;
	}

	:global(html[data-logo-transition='letters']) .logo-letter[data-letter-index='5'] {
		view-transition-name: phantom-logo-letter-5;
	}

	:global(html[data-logo-transition='letters']) .logo-letter[data-letter-index='6'] {
		view-transition-name: phantom-logo-letter-6;
	}

	:global(html[data-logo-transition='letters']) .logo-letter[data-letter-index='8'] {
		view-transition-name: phantom-logo-letter-8;
	}

	:global(html[data-logo-transition='letters']) .logo-letter[data-letter-index='9'] {
		view-transition-name: phantom-logo-letter-9;
	}

	:global(html[data-logo-transition='letters']) .logo-letter[data-letter-index='10'] {
		view-transition-name: phantom-logo-letter-10;
	}

	.text-only .logo-text {
		position: static;
		font-size: 2.05rem;
		transform: none;
	}

	.logo-art {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
		view-transition-name: phantom-logo-art;
	}

	.logo-rays {
		fill: none;
		stroke: var(--logo-rays);
		stroke-linecap: round;
		stroke-width: 2;
		opacity: 0.42;
	}

	.pen-body,
	.pen-nib {
		fill: url(#pen-metal);
		stroke: var(--logo-engraving);
		stroke-linejoin: round;
		stroke-width: 2.5;
	}

	.pen-cut {
		fill: none;
		stroke: var(--logo-engraving);
		stroke-linecap: round;
		stroke-width: 2.2;
		opacity: 0.78;
	}

	.pen-star {
		fill: var(--logo-engraving);
		opacity: 0.7;
	}

	.diamond-shadow {
		fill: var(--logo-shadow);
		opacity: 0.52;
	}

	.diamond {
		fill: var(--logo-diamond);
		stroke: var(--logo-metal-light);
		stroke-linejoin: round;
		stroke-width: 4;
	}

	.eye {
		fill: var(--logo-eye);
		stroke: var(--logo-engraving);
		stroke-width: 2.5;
	}

	.iris {
		fill: var(--logo-iris);
		stroke: var(--logo-engraving);
		stroke-width: 2;
	}

	.pupil {
		fill: var(--logo-pupil);
	}

	.eye-line {
		fill: none;
		stroke: var(--logo-engraving);
		stroke-linecap: round;
		stroke-width: 2;
		opacity: 0.62;
	}

	.eye-line.lower {
		opacity: 0.34;
	}
</style>
