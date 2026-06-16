<script lang="ts">
	import BackgroundConfigPanel from '$lib/BackgroundConfigPanel.svelte';
	import BackgroundWebGL from '$lib/BackgroundWebGL.svelte';
	import { BackgroundState } from '$lib/backgroundState.svelte';
	import { onMount } from 'svelte';

	const state = new BackgroundState();

	onMount(() => state.installDebug());
</script>

{#key state.rendererKey}
	<BackgroundWebGL {state} />
{/key}
<BackgroundConfigPanel {state} />
