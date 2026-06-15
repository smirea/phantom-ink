<script lang="ts">
	let { compact = false }: { compact?: boolean } = $props();
</script>

<svg
	class:compact
	class="phantom-logo"
	viewBox="0 0 360 156"
	role="img"
	aria-label="Phantom Ink"
	xmlns="http://www.w3.org/2000/svg"
>
	<defs>
		<filter id="soft-ink" x="-16%" y="-22%" width="132%" height="150%">
			<feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="var(--logo-shadow)" flood-opacity="0.35" />
		</filter>
		<path id="ink-arc" d="M52 93 C92 36 267 36 309 92" />
	</defs>
	<g filter="url(#soft-ink)">
		<path
			class="logo-smoke"
			d="M79 110C63 95 72 75 93 76c-6-16 9-33 28-27 8-21 39-20 48 1 19-15 52-2 52 25 22-5 39 12 33 31 28-3 44 26 25 47H95c7-15-2-31-16-43Z"
		/>
		<path class="logo-veil" d="M130 56c-17 23-16 66 0 91h100c18-27 16-70-2-93-13 13-30 15-49 5-18 10-34 9-49-3Z" />
		<path
			class="logo-face"
			d="M153 94c0-8 5-14 12-14s12 6 12 14-5 15-12 15-12-7-12-15Zm44 0c0-8 5-14 12-14s12 6 12 14-5 15-12 15-12-7-12-15Zm-29 35c7 5 17 6 25 0"
		/>
		<text class="logo-word phantom" text-anchor="middle">
			<textPath href="#ink-arc" startOffset="50%">PHANTOM</textPath>
		</text>
		<text class="logo-word ink" x="180" y="138" text-anchor="middle">INK</text>
		<path class="logo-drop" d="M286 103c13 17 10 30 0 30s-14-13 0-30Z" />
		<path class="logo-drop small" d="M71 119c8 10 6 18 0 18s-9-8 0-18Z" />
	</g>
</svg>

<style>
	.phantom-logo {
		display: block;
		width: min(17rem, 100%);
		height: auto;
		color: var(--logo-ink);
	}

	.phantom-logo.compact {
		width: min(9rem, 100%);
	}

	.logo-smoke {
		fill: var(--logo-smoke);
	}

	.logo-veil {
		fill: var(--logo-veil);
		stroke: var(--logo-stroke);
		stroke-width: 3;
	}

	.logo-face {
		fill: none;
		stroke: var(--logo-ink);
		stroke-linecap: round;
		stroke-width: 6;
	}

	.logo-word {
		fill: var(--logo-ink);
		font-family: Georgia, 'Times New Roman', serif;
		font-weight: 900;
		letter-spacing: 0;
	}

	.logo-word.phantom {
		font-size: 33px;
	}

	.logo-word.ink {
		font-size: 58px;
	}

	.logo-drop {
		fill: var(--logo-drop);
	}

	.logo-drop.small {
		opacity: 0.72;
	}
</style>
