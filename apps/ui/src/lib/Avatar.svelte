<script lang="ts">
	import type { PlayerColorId, PlayerIconId } from '@repo/shared/onlineGame';
	import { playerColorPreset, playerIconComponents } from '$lib/playerPresentation';

	type AvatarUser = { name: string; color: PlayerColorId; icon: PlayerIconId };

	const {
		user,
		name = 'after',
		class: cls,
		...rest
	}: { user: AvatarUser; name?: boolean | 'before' | 'after'; class?: string } = $props();

	const Icon = $derived(playerIconComponents[user.icon]);
	const color = $derived(playerColorPreset(user.color).value);
</script>

{#snippet nameDiv()}
	<div class="name">{user.name}</div>
{/snippet}

<span {...rest} class={['avatar', cls]} style:--color={color}>
	{#if name === 'before'}
		{@render nameDiv()}
	{/if}
	<Icon strokeWidth={2} class="icon" {color} />
	{#if name === 'after'}
		{@render nameDiv()}
	{/if}
</span>

<style>
	.avatar {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	.icon {
		flex: 0 0 auto;
		width: 0.75em;
		height: 0.75em;
		color: var(--color);
		filter: drop-shadow(0 0 0.45rem color-mix(in oklab, var(--color) 25%, transparent));
	}
</style>
