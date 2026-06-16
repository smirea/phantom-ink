<script lang="ts">
	import type { PlayerIconId } from '@repo/shared/onlineGame';
	import Angry from '@lucide/svelte/icons/angry';
	import Bug from '@lucide/svelte/icons/bug';
	import Cat from '@lucide/svelte/icons/cat';
	import Drama from '@lucide/svelte/icons/drama';
	import Fish from '@lucide/svelte/icons/fish';
	import Ghost from '@lucide/svelte/icons/ghost';
	import Rabbit from '@lucide/svelte/icons/rabbit';
	import Rat from '@lucide/svelte/icons/rat';
	import Skull from '@lucide/svelte/icons/skull';
	import Snail from '@lucide/svelte/icons/snail';
	import VenetianMask from '@lucide/svelte/icons/venetian-mask';
	import Worm from '@lucide/svelte/icons/worm';

	const iconComponents = {
		ghost: Ghost,
		skull: Skull,
		'venetian-mask': VenetianMask,
		drama: Drama,
		cat: Cat,
		rabbit: Rabbit,
		rat: Rat,
		snail: Snail,
		bug: Bug,
		worm: Worm,
		fish: Fish,
		angry: Angry,
	};

	let { color, icon, label = 'Soul avatar' }: { color: string; icon: PlayerIconId; label?: string } = $props();
	const Icon = $derived(iconComponents[icon] ?? Ghost);
</script>

<span aria-label={label} class="player-avatar" role="img" style={`--avatar-color: ${color}`}>
	<Icon size={30} strokeWidth={2} />
</span>

<style>
	.player-avatar {
		display: inline-grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		color: var(--avatar-color);
		flex: 0 0 auto;
		filter: drop-shadow(0 0 0.45rem color-mix(in oklab, var(--avatar-color) 25%, transparent));
	}
</style>
