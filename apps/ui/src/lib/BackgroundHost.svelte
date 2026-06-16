<script lang="ts">
	import AnimatedBackground from '$lib/AnimatedBackground.svelte';
	import BackgroundCanvas2D from '$lib/BackgroundCanvas2D.svelte';
	import BackgroundConfigPanel from '$lib/BackgroundConfigPanel.svelte';
	import BackgroundDomImperative from '$lib/BackgroundDomImperative.svelte';
	import BackgroundSelector from '$lib/BackgroundSelector.svelte';
	import BackgroundSvg from '$lib/BackgroundSvg.svelte';
	import BackgroundWebGL from '$lib/BackgroundWebGL.svelte';
	import { BackgroundState } from '$lib/backgroundState.svelte';
	import { onMount } from 'svelte';

	const state = new BackgroundState();

	onMount(() => state.installDebug());
</script>

{#key state.selectedBackgroundId}
	{#if state.selectedBackgroundId === 'dom-svelte'}
		<AnimatedBackground {state} />
	{:else if state.selectedBackgroundId === 'canvas-2d'}
		<BackgroundCanvas2D {state} />
	{:else if state.selectedBackgroundId === 'webgl'}
		<BackgroundWebGL {state} />
	{:else if state.selectedBackgroundId === 'svg'}
		<BackgroundSvg {state} />
	{:else if state.selectedBackgroundId === 'dom-imperative'}
		<BackgroundDomImperative {state} />
	{/if}
{/key}

<BackgroundSelector {state} />
<BackgroundConfigPanel {state} />
