<script lang="ts">
	import InkButton from '$lib/InkButton.svelte';
	import PhantomLogo from '$lib/PhantomLogo.svelte';
</script>

<svelte:head>
	<title>Phantom Ink</title>
</svelte:head>

<section class="start-screen">
	<PhantomLogo />
	<a href="/lobby">
		<InkButton primary size="lg" style="width: 15rem">Start</InkButton>
	</a>
</section>

<style>
	.start-screen {
		position: relative;
		z-index: 1;
		display: grid;
		justify-items: center;
		gap: 1rem;
		width: min(100%, 32rem);
		padding: 1rem;
	}
</style>
