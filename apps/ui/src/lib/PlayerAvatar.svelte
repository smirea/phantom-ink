<script lang="ts">
	import type { PlayerIconId } from '@repo/shared/onlineGame';
	import { playerIconComponents } from '$lib/playerPresentation';

	let { color, icon, label = 'Soul avatar' }: { color: string; icon: PlayerIconId; label?: string } = $props();
	const Icon = $derived(playerIconComponents[icon]);
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
