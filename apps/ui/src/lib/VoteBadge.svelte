<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import { type RoomMemberView, type RoomVoteSummary } from '@repo/shared/onlineGame';
	import Check from '@lucide/svelte/icons/check';
	import Minus from '@lucide/svelte/icons/minus';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import { clamp, compact } from 'es-toolkit';
	import { onMount, tick } from 'svelte';

	let {
		summary,
		members,
		label = 'Votes',
	}: {
		summary: RoomVoteSummary | null | undefined;
		members: RoomMemberView[];
		label?: string;
	} = $props();

	let isOpen = $state(false);
	let isFlashing = $state(false);
	let lastCount = $state<number | null>(null);
	let badgeButton = $state<HTMLButtonElement | null>(null);
	let popoverNode = $state<HTMLDivElement | null>(null);
	let popoverStyle = $state('visibility: hidden;');
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	let flashFrame: number | undefined;

	const currentVotes = $derived(summary?.currentVotes ?? 0);
	const requiredVotes = $derived(summary?.requiredVotes ?? 0);
	const voters = $derived(compact((summary?.voterIds ?? []).map(memberForId)));
	const missing = $derived(compact((summary?.missingPlayerIds ?? []).map(memberForId)));

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
		function handleDocumentClick(event: MouseEvent) {
			if (!isOpen || !(event.target instanceof Node)) return;
			if (badgeButton?.contains(event.target) || popoverNode?.contains(event.target)) return;
			isOpen = false;
		}

		function handleViewportChange() {
			if (isOpen) updatePopoverPosition();
		}

		document.addEventListener('click', handleDocumentClick, true);
		window.addEventListener('resize', handleViewportChange);
		window.addEventListener('scroll', handleViewportChange, true);

		return () => {
			if (flashFrame !== undefined) cancelAnimationFrame(flashFrame);
			if (flashTimer) clearTimeout(flashTimer);
			document.removeEventListener('click', handleDocumentClick, true);
			window.removeEventListener('resize', handleViewportChange);
			window.removeEventListener('scroll', handleViewportChange, true);
		};
	});

	function memberForId(playerId: string): RoomMemberView | null {
		return members.find(member => member.id === playerId) ?? null;
	}

	async function toggle(event: MouseEvent) {
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

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			},
		};
	}
</script>

<div class:open={isOpen} class="vote-wrap">
	<button
		bind:this={badgeButton}
		aria-expanded={isOpen}
		aria-label={`${label}: ${currentVotes} of ${requiredVotes}`}
		class:flash={isFlashing}
		class="vote-badge"
		onclick={toggle}
		type="button"
	>
		<ScrollText size={14} strokeWidth={2.4} />
		<span>{currentVotes}/{requiredVotes}</span>
	</button>

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
</div>

<style>
	.vote-wrap {
		position: absolute;
		top: 0;
		right: 0;
		z-index: 3;
		opacity: var(--vote-badge-opacity, 1);
		pointer-events: var(--vote-badge-pointer-events, auto);
		transform: translate(50%, -50%) scale(var(--vote-badge-scale, 1));
		transition:
			opacity 160ms ease,
			transform 160ms ease;
	}

	.vote-wrap.open {
		opacity: 1;
		pointer-events: auto;
		transform: translate(50%, -50%) scale(1);
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
