<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import type { User } from '@repo/shared/onlineGame';
	import Check from '@lucide/svelte/icons/check';
	import Minus from '@lucide/svelte/icons/minus';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import { clamp } from 'es-toolkit';
	import { flip } from 'svelte/animate';
	import { onMount, tick } from 'svelte';
	import { fly, scale } from 'svelte/transition';

	type VotingState = { voted: User['id'][]; eligible: User[]; required?: number };
	type VoteBadgeMode = 'counter' | 'avatar';

	let {
		label = 'Votes',
		mode = 'counter',
		passive = false,
		voting,
	}: {
		label?: string;
		mode?: VoteBadgeMode;
		passive?: boolean;
		voting: VotingState;
	} = $props();

	let isOpen = $state(false);
	let isFlashing = $state(false);
	let lastCount = $state<number | null>(null);
	let badgeButton = $state<HTMLElement | null>(null);
	let avatarViewport = $state<HTMLElement | null>(null);
	let popoverNode = $state<HTMLDivElement | null>(null);
	let popoverStyle = $state('visibility: hidden;');
	let avatarGap = $state(4);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	let flashFrame: number | undefined;

	const voters = $derived(voting.eligible.filter(user => voting.voted.includes(user.id)));
	const missing = $derived(voting.eligible.filter(user => !voting.voted.includes(user.id)));
	const currentVotes = $derived(voting.voted.length);
	const requiredVotes = $derived(voting.required ?? voting.eligible.length);
	const avatarMode = $derived(mode === 'avatar');
	const avatarStyle = $derived(`--vote-avatar-gap: ${avatarGap}px;`);

	$effect(() => {
		if (lastCount === null) {
			lastCount = currentVotes;
			return;
		}
		if (currentVotes === lastCount) return;
		lastCount = currentVotes;
		isFlashing = false;
		if (flashFrame !== undefined) cancelAnimationFrame(flashFrame);
		if (flashTimer) clearTimeout(flashTimer);
		flashFrame = requestAnimationFrame(() => {
			flashFrame = undefined;
			isFlashing = true;
			flashTimer = setTimeout(() => {
				isFlashing = false;
			}, 520);
		});
	});

	onMount(() => {
		let resizeObserver: ResizeObserver | undefined;

		function handleDocumentClick(event: MouseEvent) {
			if (!isOpen || !(event.target instanceof Node)) return;
			if (badgeButton?.contains(event.target) || popoverNode?.contains(event.target)) return;
			isOpen = false;
		}

		function handleViewportChange() {
			if (isOpen) updatePopoverPosition();
		}

		if (avatarMode) {
			resizeObserver = new ResizeObserver(() => updateAvatarGap());
			if (avatarViewport) resizeObserver.observe(avatarViewport);
			void tick().then(() => updateAvatarGap());
		}

		if (!passive) {
			document.addEventListener('click', handleDocumentClick, true);
			window.addEventListener('resize', handleViewportChange);
			window.addEventListener('scroll', handleViewportChange, true);
		}

		return () => {
			resizeObserver?.disconnect();
			if (flashFrame !== undefined) cancelAnimationFrame(flashFrame);
			if (flashTimer) clearTimeout(flashTimer);
			document.removeEventListener('click', handleDocumentClick, true);
			window.removeEventListener('resize', handleViewportChange);
			window.removeEventListener('scroll', handleViewportChange, true);
		};
	});

	$effect(() => {
		const count = voters.length;
		if (!avatarMode) return;
		void tick().then(() => updateAvatarGap(count));
	});

	async function toggle(event: Event) {
		event.preventDefault();
		event.stopPropagation();
		if (isOpen) {
			isOpen = false;
			return;
		}

		popoverStyle = 'visibility: hidden;';
		isOpen = true;
		await tick();
		updatePopoverPosition();
	}

	function updatePopoverPosition() {
		if (!badgeButton || !popoverNode) return;

		const anchor = badgeButton.getBoundingClientRect();
		const popover = popoverNode.getBoundingClientRect();
		const margin = 10;
		const left = clamp(anchor.right - popover.width, margin, window.innerWidth - popover.width - margin);
		const topBelow = anchor.bottom + 7;
		const top =
			topBelow + popover.height + margin > window.innerHeight
				? Math.max(margin, anchor.top - popover.height - 7)
				: topBelow;

		popoverStyle = `left: ${left}px; top: ${top}px;`;
	}

	function updateAvatarGap(count = voters.length) {
		if (!avatarViewport) return;

		if (count <= 1) {
			avatarGap = 4;
			return;
		}

		const avatarSize = 22;
		const defaultGap = 4;
		const minGap = -8;
		const available = avatarViewport.clientWidth;
		const naturalWidth = count * avatarSize + (count - 1) * defaultGap;
		avatarGap =
			naturalWidth <= available ? defaultGap : Math.max(minGap, (available - count * avatarSize) / (count - 1));
	}

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			},
		};
	}
</script>

{#snippet Popover()}
	{#if isOpen}
		<div
			bind:this={popoverNode}
			use:portal
			class="vote-popover"
			style={popoverStyle}
			onclick={event => event.stopPropagation()}
		>
			{#if voters.length}
				<div class="vote-group">
					{#each voters as member (member.id)}
						<div class="vote-person">
							<Check class="yes" size={15} strokeWidth={2.6} />
							<Avatar user={member} name={false} />
							<span>{member.name}</span>
						</div>
					{/each}
				</div>
			{:else}
				<div class="vote-empty">No votes yet</div>
			{/if}
			{#if missing.length}
				<div class="vote-group missing">
					{#each missing as member (member.id)}
						<div class="vote-person">
							<Minus size={15} strokeWidth={2.6} />
							<Avatar user={member} name={false} />
							<span>{member.name}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet AvatarVotes()}
	<span bind:this={avatarViewport} class="vote-avatar-viewport" style={avatarStyle}>
		<span class="vote-avatar-pack" class:flash={isFlashing}>
			{#each voters as member (member.id)}
				<span
					animate:flip={{ duration: 260 }}
					class="vote-avatar"
					in:fly={{ y: 11, duration: 240 }}
					out:scale={{ duration: 170, start: 0.72 }}
				>
					<Avatar user={member} name={false} />
				</span>
			{/each}
		</span>
	</span>
{/snippet}

{#snippet BadgeContent()}
	{#if avatarMode}
		{@render AvatarVotes()}
	{:else}
		<ScrollText size={14} strokeWidth={2.4} />
		<span>{currentVotes}/{requiredVotes}</span>
	{/if}
{/snippet}

{#if passive}
	<span class="vote-wrap" data-empty={avatarMode && !voters.length ? 'true' : undefined} data-mode={mode}>
		<span
			aria-label={`${label}: ${currentVotes} of ${requiredVotes}`}
			class:flash={isFlashing && !avatarMode}
			class="vote-badge"
			data-mode={mode}
		>
			{@render BadgeContent()}
		</span>
	</span>
{:else}
	<div
		class:open={isOpen}
		class="vote-wrap"
		data-empty={avatarMode && !voters.length ? 'true' : undefined}
		data-mode={mode}
	>
		<button
			bind:this={badgeButton}
			aria-expanded={isOpen}
			aria-label={`${label}: ${currentVotes} of ${requiredVotes}`}
			class:flash={isFlashing && !avatarMode}
			class="vote-badge"
			data-mode={mode}
			onclick={toggle}
			type="button"
		>
			{@render BadgeContent()}
		</button>

		{@render Popover()}
	</div>
{/if}

<style>
	.vote-avatar-viewport {
		display: flex;
		justify-content: center;
		width: 100%;
		overflow: visible;
		pointer-events: none;
	}

	.vote-avatar-pack {
		display: inline-flex;
		align-items: flex-end;
		justify-content: center;
		min-width: 0;
		max-width: 100%;
	}

	.vote-avatar {
		display: inline-grid;
		place-items: center;
		width: 1.38rem;
		height: 1.38rem;
		flex: 0 0 auto;
		margin-left: var(--vote-avatar-gap);
		will-change: opacity, transform;
	}

	.vote-avatar:first-child {
		margin-left: 0;
	}

	.vote-avatar :global(.avatar) {
		display: inline-grid;
		place-items: center;
		width: 1.38rem;
		height: 1.38rem;
		filter: drop-shadow(0 0.2rem 0.34rem color-mix(in oklab, black 42%, transparent))
			drop-shadow(0 0 0.45rem color-mix(in oklab, var(--app-focus) 20%, transparent));
	}

	.vote-avatar :global(.avatar svg) {
		width: 1.08rem;
		height: 1.08rem;
	}

	.vote-avatar-pack.flash {
		animation: vote-avatar-flash 520ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.vote-wrap {
		position: absolute;
		top: 0;
		right: 50%;
		z-index: 3;
		opacity: var(--vote-badge-opacity, 1);
		pointer-events: var(--vote-badge-pointer-events, auto);
		transform: translate(50%, -75%) scale(var(--vote-badge-scale, 1));
		transition:
			opacity 160ms ease,
			transform 160ms ease;
	}

	.vote-wrap.open {
		opacity: 1;
		pointer-events: auto;
		transform: translate(50%, -50%) scale(1);
	}

	.vote-wrap[data-mode='avatar'] {
		display: flex;
		justify-content: center;
		width: calc(100% - 0.7rem);
		min-width: 1.8rem;
		max-width: 7.25rem;
		opacity: 1;
		pointer-events: none;
		transform: translate(50%, -66%) scale(1);
	}

	.vote-wrap[data-mode='avatar'][data-empty='true'] {
		opacity: 0;
		transform: translate(50%, -58%) scale(0.9);
	}

	.vote-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.22rem;
		min-height: 1.72rem;
		border: 1px solid color-mix(in oklab, var(--app-accent) 42%, var(--app-border));
		border-radius: 999px;
		background: color-mix(in oklab, var(--app-panel) 86%, transparent);
		box-shadow:
			0 0.45rem 1rem color-mix(in oklab, black 24%, transparent),
			inset 0 0 0 1px color-mix(in oklab, white 7%, transparent);
		color: var(--app-accent);
		cursor: pointer;
		font: inherit;
		font-size: 0.72rem;
		font-weight: 950;
		line-height: 1;
		padding: 0 0.5rem;
		transition:
			background 160ms ease,
			border-color 160ms ease,
			color 160ms ease,
			transform 160ms ease;
	}

	.vote-badge[data-mode='avatar'] {
		justify-content: center;
		width: 100%;
		min-width: 0;
		cursor: default;
		overflow: visible;
		padding: 0 0.42rem;
	}

	.vote-badge:hover,
	.vote-badge[aria-expanded='true'] {
		background: color-mix(in oklab, var(--app-accent) 18%, var(--app-panel));
		border-color: var(--app-accent);
		transform: translateY(-1px);
	}

	.vote-badge.flash {
		animation: vote-flash 520ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	.vote-popover {
		position: fixed;
		z-index: 100;
		display: grid;
		gap: 0.4rem;
		width: max-content;
		min-width: 10.5rem;
		max-width: min(17rem, 72vw);
		border: 1px solid color-mix(in oklab, var(--app-border) 78%, transparent);
		border-radius: 0.5rem;
		background:
			linear-gradient(180deg, color-mix(in oklab, var(--app-panel) 96%, white 4%), var(--app-panel)), var(--app-panel);
		box-shadow:
			0 1rem 2.3rem color-mix(in oklab, black 42%, transparent),
			inset 0 0 0 1px color-mix(in oklab, white 6%, transparent);
		padding: 0.55rem;
		animation: vote-pop 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.vote-group {
		display: grid;
		gap: 0.28rem;
	}

	.vote-group.missing {
		border-top: 1px solid color-mix(in oklab, var(--app-border) 58%, transparent);
		padding-top: 0.4rem;
	}

	.vote-person {
		display: grid;
		grid-template-columns: 1rem auto minmax(0, 1fr);
		align-items: center;
		gap: 0.32rem;
		min-width: 0;
		color: var(--app-text);
		font-size: 0.82rem;
		font-weight: 850;
	}

	.vote-person :global(.avatar) {
		display: inline-grid;
		place-items: center;
		width: 1.35rem;
		height: 1.35rem;
		flex: 0 0 auto;
	}

	.vote-person :global(.avatar svg) {
		width: 1.1rem;
		height: 1.1rem;
	}

	.vote-person span {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.yes) {
		color: #78d88d;
	}

	.vote-empty {
		color: var(--app-muted);
		font-size: 0.8rem;
		font-weight: 800;
	}

	@keyframes vote-avatar-flash {
		0% {
			filter: brightness(0.9);
			transform: translateY(0.18rem) scale(0.92);
		}

		48% {
			filter: brightness(1.2);
			transform: translateY(-0.08rem) scale(1.08);
		}

		100% {
			filter: brightness(1);
			transform: translateY(0) scale(1);
		}
	}

	@keyframes vote-flash {
		0% {
			box-shadow: 0 0 0 0 color-mix(in oklab, var(--app-accent) 46%, transparent);
			transform: scale(0.96);
		}

		46% {
			box-shadow: 0 0 0 0.34rem color-mix(in oklab, var(--app-accent) 0%, transparent);
			transform: scale(1.08);
		}

		100% {
			transform: scale(1);
		}
	}

	@keyframes vote-pop {
		from {
			opacity: 0;
			filter: blur(0.16rem);
			transform: translateY(-0.2rem) scale(0.97);
		}
	}
</style>
