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

	let { color, icon, label = 'Player avatar' }: { color: string; icon: PlayerIconId; label?: string } = $props();
	const Icon = $derived(iconComponents[icon] ?? Ghost);
</script>

<span aria-label={label} class="player-avatar" role="img" style={`--avatar-color: ${color}`}>
	<Icon size={22} strokeWidth={1.9} />
</span>

<style>
	.player-avatar {
		display: inline-grid;
		place-items: center;
		width: 2.35rem;
		height: 2.35rem;
		border: 1px solid color-mix(in oklab, var(--avatar-color) 70%, var(--app-border));
		border-radius: 999px;
		background:
			radial-gradient(circle at 34% 28%, color-mix(in oklab, var(--avatar-color) 24%, white 6%), transparent 54%),
			color-mix(in oklab, var(--avatar-color) 18%, var(--app-panel));
		box-shadow:
			0 0.65rem 1.3rem color-mix(in oklab, var(--avatar-color) 20%, transparent),
			inset 0 0 0 1px color-mix(in oklab, white 10%, transparent);
		color: var(--avatar-color);
		flex: 0 0 auto;
	}
</style>
