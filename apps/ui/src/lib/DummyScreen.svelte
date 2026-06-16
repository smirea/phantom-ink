<script lang="ts">
	type DummySize = 'small' | 'medium' | 'large';

	let { size }: { size: DummySize } = $props();
</script>

<div class={`dummy-screen ${size}`} aria-label={`${size} placeholder content`}></div>

<style>
	.dummy-screen {
		min-height: var(--dummy-height);
		border: 1px dashed color-mix(in oklab, var(--app-border) 78%, transparent);
		border-radius: 0.5rem;
		background:
			linear-gradient(
				135deg,
				color-mix(in oklab, var(--app-highlight) 86%, transparent),
				color-mix(in oklab, var(--app-input) 92%, transparent)
			),
			var(--app-input);
	}

	.dummy-screen.small {
		--dummy-height: 11rem;
	}

	.dummy-screen.medium {
		--dummy-height: 34rem;
	}

	.dummy-screen.large {
		--dummy-height: 72rem;
	}
</style>
