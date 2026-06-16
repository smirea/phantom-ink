<script lang="ts">
	let { compact = false }: { compact?: boolean } = $props();
</script>

<svg
	class:compact
	class="phantom-logo"
	viewBox="0 0 520 220"
	role="img"
	aria-label="Phantom Ink"
	xmlns="http://www.w3.org/2000/svg"
>
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

	<g class="logo-rays" aria-hidden="true">
		<path d="M260 112V12" />
		<path d="M226 118 168 22" />
		<path d="M294 118 352 22" />
		<path d="M195 130 82 44" />
		<path d="M325 130 438 44" />
		<path d="M176 154 34 126" />
		<path d="M344 154 486 126" />
	</g>

	<g filter="url(#logo-shadow)">
		<text class="logo-word logo-word-shadow" x="260" y="86" text-anchor="middle">Phantom Ink</text>
		<text class="logo-word" x="260" y="82" text-anchor="middle">Phantom Ink</text>

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

<style>
	.phantom-logo {
		display: block;
		width: min(28rem, 100%);
		height: auto;
		color: var(--logo-word);
		overflow: visible;
	}

	.phantom-logo.compact {
		width: min(10.5rem, 100%);
	}

	.logo-rays {
		fill: none;
		stroke: var(--logo-rays);
		stroke-linecap: round;
		stroke-width: 2;
		opacity: 0.42;
	}

	.logo-word {
		fill: var(--logo-word);
		stroke: var(--logo-word-stroke);
		stroke-linejoin: round;
		stroke-width: 5;
		font-family: Luminari, 'Palatino Linotype', Georgia, serif;
		font-size: 69px;
		font-weight: 900;
		letter-spacing: 0;
		paint-order: stroke fill;
	}

	.logo-word-shadow {
		fill: var(--logo-word-shadow);
		stroke: var(--logo-shadow);
		stroke-width: 7;
		opacity: 0.72;
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
