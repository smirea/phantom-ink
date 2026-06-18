<script lang="ts">
	import Avatar from '$lib/Avatar.svelte';
	import InkButton from '$lib/InkButton.svelte';
	import { api } from '$lib/api';
	import { getAppContext } from '$lib/appContext';
	import { createRoomCode } from '$lib/roomCodes';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { type RoomDirectoryListing, type User } from '@repo/shared/onlineGame';
	import { cubicOut, quintOut } from 'svelte/easing';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Plus from '@lucide/svelte/icons/plus';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import { onMount } from 'svelte';
	import type { TransitionConfig } from 'svelte/transition';

	const appContext = getAppContext();
	let rooms = $state<RoomDirectoryListing[]>([]);
	let nearbySouls = $state<User[]>([]);
	let expandedRooms = $state<Set<string>>(new Set());
	let collapsibleRooms = $state<Set<string>>(new Set());
	let nearbyExpanded = $state(false);
	let nearbyCollapsible = $state(false);
	let isLoading = $state(true);
	let isCreating = $state(false);
	let joiningCode = $state<string | null>(null);
	let error = $state<string | null>(null);
	const playerListElements = new Map<string, HTMLElement>();
	let nearbyListElement = $state<HTMLElement | undefined>();
	let measureFrame: number | undefined;
	let delayedMeasureTimer: number | undefined;
	const playerListMeasureKey = $derived(
		rooms.map(room => `${room.code}:${room.players.map(player => `${player.id}:${player.name}`).join(',')}`).join('|'),
	);
	const nearbyMeasureKey = $derived(nearbySouls.map(soul => `${soul.id}:${soul.name}`).join('|'));

	onMount(() => {
		let cancelled = false;

		async function load() {
			try {
				const userId = appContext.user.id > 0 ? appContext.user.id : null;
				const [roomsPayload, nearbySoulsPayload] = await Promise.all([
					api.rooms.list(),
					api.presence.online({ userId }),
				]);
				if (!cancelled) {
					rooms = roomsPayload.rooms;
					nearbySouls = nearbySoulsPayload.users;
					error = null;
				}
			} catch {
				if (!cancelled) error = 'Unable to load open séances.';
			} finally {
				if (!cancelled) isLoading = false;
			}
		}

		void load();
		const interval = window.setInterval(() => void load(), 2500);
		const handleResize = () => scheduleListMeasure();
		window.addEventListener('resize', handleResize);
		return () => {
			cancelled = true;
			if (measureFrame !== undefined) window.cancelAnimationFrame(measureFrame);
			if (delayedMeasureTimer) window.clearTimeout(delayedMeasureTimer);
			window.clearInterval(interval);
			window.removeEventListener('resize', handleResize);
		};
	});

	$effect(() => {
		scheduleListMeasure(playerListMeasureKey);
	});

	$effect(() => {
		scheduleListMeasure(nearbyMeasureKey);
		scheduleDelayedListMeasure(nearbyMeasureKey);
	});

	async function startNewSeance() {
		if (isCreating) return;
		isCreating = true;
		error = null;
		try {
			await joinAndNavigate(createUnusedRoomCode());
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to start a séance.';
		} finally {
			isCreating = false;
		}
	}

	async function joinExistingRoom(code: string) {
		if (joiningCode || isCreating) return;
		error = null;
		try {
			await joinAndNavigate(code);
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to join séance.';
		}
	}

	async function joinAndNavigate(code: string) {
		joiningCode = code;
		try {
			const userId = appContext.user.id;
			if (userId <= 0) throw new Error('Missing user');

			await api.rooms.join({ code, userId });
			await goto(roomHref(code), { noScroll: true });
		} finally {
			joiningCode = null;
		}
	}

	function createUnusedRoomCode(): string {
		const usedCodes = new Set(rooms.map(room => room.code));
		for (let attempt = 0; attempt < 16; attempt += 1) {
			const code = createRoomCode();
			if (!usedCodes.has(code)) return code;
		}
		return createRoomCode();
	}

	function roomHref(code: string): string {
		return `/room/${code}${page.url.search}${page.url.hash}`;
	}

	function isExpanded(code: string): boolean {
		return expandedRooms.has(code);
	}

	function isCollapsible(code: string): boolean {
		return collapsibleRooms.has(code);
	}

	function toggleExpanded(event: MouseEvent, code: string) {
		event.stopPropagation();
		const next = new Set(expandedRooms);
		if (next.has(code)) next.delete(code);
		else next.add(code);
		expandedRooms = next;
	}

	function toggleNearbyExpanded() {
		nearbyExpanded = !nearbyExpanded;
	}

	function handleRoomKeydown(event: KeyboardEvent, code: string) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		void joinExistingRoom(code);
	}

	function trackPlayerList(node: HTMLElement, code: string) {
		let currentCode = code;
		playerListElements.set(currentCode, node);
		scheduleListMeasure();

		return {
			update(nextCode: string) {
				if (currentCode === nextCode) return;
				playerListElements.delete(currentCode);
				currentCode = nextCode;
				playerListElements.set(currentCode, node);
				scheduleListMeasure();
			},
			destroy() {
				playerListElements.delete(currentCode);
				scheduleListMeasure();
			},
		};
	}

	function scheduleListMeasure(_key?: string) {
		if (typeof window === 'undefined' || measureFrame !== undefined) return;
		measureFrame = window.requestAnimationFrame(() => {
			measureFrame = undefined;
			measureLists();
		});
	}

	function scheduleDelayedListMeasure(_key?: string) {
		if (typeof window === 'undefined') return;
		if (delayedMeasureTimer) window.clearTimeout(delayedMeasureTimer);
		delayedMeasureTimer = window.setTimeout(() => {
			delayedMeasureTimer = undefined;
			scheduleListMeasure();
		}, 720);
	}

	function measureLists() {
		const next = new Set<string>();
		for (const [code, node] of playerListElements) {
			if (hasMoreWrappedLines(node, 2)) next.add(code);
		}
		collapsibleRooms = next;
		expandedRooms = new Set([...expandedRooms].filter(code => next.has(code)));

		nearbyCollapsible = Boolean(nearbyListElement && hasMoreWrappedLines(nearbyListElement, 1));
		if (!nearbyCollapsible) nearbyExpanded = false;
	}

	function hasMoreWrappedLines(node: HTMLElement, visibleLines: number): boolean {
		const lineCenters: number[] = [];
		for (const child of node.children) {
			if (!(child instanceof HTMLElement) || (!child.offsetWidth && !child.offsetHeight)) continue;

			const center = Math.round(child.offsetTop + child.offsetHeight / 2);
			if (!lineCenters.some(lineCenter => Math.abs(lineCenter - center) <= 4)) lineCenters.push(center);
			if (lineCenters.length > visibleLines) return true;
		}

		return false;
	}

	function soulRise(_node: Element): TransitionConfig {
		if (prefersReducedMotion()) return { duration: 0 };

		return {
			duration: 520,
			easing: quintOut,
			css: (t, u) => `
				opacity: ${t};
				transform: translate3d(0, ${u * 1.35}rem, 0) scale(${0.9 + t * 0.1});
				filter: blur(${u * 0.42}rem);
			`,
		};
	}

	function soulEvaporate(_node: Element): TransitionConfig {
		if (prefersReducedMotion()) return { duration: 0 };

		return {
			duration: 620,
			easing: cubicOut,
			css: (t, u) => `
				opacity: ${t * t};
				transform: translate3d(${u * 0.28}rem, ${u * -0.72}rem, 0) scale(${1 + u * 0.14});
				filter: blur(${u * 0.56}rem);
			`,
		};
	}

	function prefersReducedMotion(): boolean {
		return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}
</script>

<svelte:head>
	<title>Lobby | Phantom Ink</title>
</svelte:head>

<section class="lobby-screen">
	<InkButton
		class="new-seance-button"
		disabled={isCreating || Boolean(joiningCode)}
		onclick={startNewSeance}
		primary
		size="lg"
		type="button"
	>
		{#if isCreating}
			<LoaderCircle class="spin" size={24} strokeWidth={2.4} />
		{:else}
			<Plus size={26} strokeWidth={2.5} />
		{/if}
		<span>Convene a new séance</span>
	</InkButton>

	{#if nearbySouls.length}
		<div class:collapsible={nearbyCollapsible} class="nearby-souls">
			{#if nearbyCollapsible}
				<button
					aria-expanded={nearbyExpanded}
					aria-label={`${nearbyExpanded ? 'Collapse' : 'Expand'} nearby souls`}
					class="nearby-expand-button"
					onclick={toggleNearbyExpanded}
					type="button"
				>
					<ChevronDown size={19} strokeWidth={2.5} />
				</button>
			{/if}

			<div bind:this={nearbyListElement} class:expanded={nearbyExpanded} class="nearby-list">
				<span class="nearby-label">
					{nearbySouls.length} nearby {nearbySouls.length === 1 ? 'soul' : 'souls'}:
				</span>
				{#each nearbySouls as soul (soul.id)}
					<span class="nearby-pill" in:soulRise|local out:soulEvaporate|local>
						<Avatar user={soul} name={false} />
						<span>{soul.name}</span>
					</span>
				{/each}
			</div>
		</div>
	{/if}

	<div class="lobby-list" aria-live="polite">
		{#if rooms.length}
			{#each rooms as room (room.code)}
				{@const expanded = isExpanded(room.code)}
				{@const collapsible = isCollapsible(room.code)}
				<div
					aria-label={`Join séance ${room.code}`}
					class:collapsible
					class:joining={joiningCode === room.code}
					class="lobby-row"
					onclick={() => joinExistingRoom(room.code)}
					onkeydown={event => handleRoomKeydown(event, room.code)}
					role="button"
					tabindex="0"
				>
					{#if collapsible}
						<button
							aria-expanded={expanded}
							aria-label={`${expanded ? 'Collapse' : 'Expand'} ${room.code} souls`}
							class="expand-button"
							onclick={event => toggleExpanded(event, room.code)}
							type="button"
						>
							<ChevronDown size={21} strokeWidth={2.5} />
						</button>
					{/if}

					<div class="lobby-row-meta">
						<div class="room-code">{room.code}</div>
						<div class="player-count">
							<UsersRound size={16} strokeWidth={2.2} />
							<span>{room.playerCount} {room.playerCount === 1 ? 'soul' : 'souls'}</span>
						</div>
						{#if room.phase === 'playing'}
							<div class="phase-pill">Started</div>
						{/if}
					</div>

					<div class:expanded class="player-list" use:trackPlayerList={room.code}>
						{#each room.players as player (player.id)}
							<span class="player-pill">
								<Avatar user={player} name={false} />
								<span>{player.name}</span>
							</span>
						{/each}
					</div>
				</div>
			{/each}
		{:else if isLoading}
			<div class="empty-lobby">Looking for open séances...</div>
		{:else}
			<div class="empty-lobby">No open séances yet.</div>
		{/if}
	</div>

	{#if error}
		<p class="lobby-error">{error}</p>
	{/if}
</section>

<style>
	.lobby-screen {
		display: grid;
		gap: 1rem;
		min-width: 0;
	}

	:global(.new-seance-button) {
		gap: 0.6rem;
		width: 100%;
		min-height: 4rem;
		background:
			linear-gradient(180deg, color-mix(in oklab, var(--app-accent) 86%, white 14%), var(--app-accent)),
			var(--app-accent);
		font-size: clamp(1.1rem, 4.8vw, 1.45rem);
		font-weight: 950;
		padding: 0.85rem 1rem;
	}

	.lobby-list {
		display: grid;
		gap: 0.65rem;
		min-width: 0;
	}

	.nearby-souls {
		position: relative;
		min-width: 0;
		border: 1px solid color-mix(in oklab, var(--app-border) 62%, transparent);
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--app-input) 52%, transparent);
		padding: 0.52rem 0.62rem;
	}

	.nearby-souls.collapsible {
		padding-right: 2.95rem;
	}

	.nearby-list {
		--collapsed-nearby-list-height: 2rem;

		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 0.45rem;
		max-height: var(--collapsed-nearby-list-height);
		overflow: hidden;
	}

	.nearby-list.expanded {
		max-height: none;
	}

	.nearby-label {
		color: var(--app-muted);
		font-size: 0.92rem;
		font-weight: 900;
		line-height: 1;
		white-space: nowrap;
	}

	.nearby-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.28rem;
		min-width: 0;
		max-width: 100%;
		color: var(--app-text);
		font-size: 0.86rem;
		font-weight: 850;
		line-height: 1;
		transform-origin: 50% 100%;
		will-change: transform, filter, opacity;
	}

	.nearby-pill :global(.avatar) {
		display: inline-grid;
		place-items: center;
		width: 1.55rem;
		height: 1.55rem;
		flex: 0 0 auto;
	}

	.nearby-pill :global(.avatar svg) {
		width: 1.24rem;
		height: 1.24rem;
	}

	.nearby-pill span:last-child {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.lobby-row {
		position: relative;
		display: grid;
		grid-template-columns: minmax(5.6rem, auto) minmax(0, 1fr);
		gap: 0.6rem;
		align-items: start;
		min-width: 0;
		border: 1px solid color-mix(in oklab, var(--app-border) 78%, transparent);
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--app-input) 68%, transparent);
		cursor: pointer;
		padding: 0.82rem;
		transition:
			background 180ms ease,
			border-color 180ms ease,
			transform 180ms ease;
	}

	.lobby-row.collapsible {
		padding-right: 3rem;
	}

	.lobby-row:hover,
	.lobby-row:focus-visible {
		border-color: color-mix(in oklab, var(--app-accent) 58%, var(--app-border));
		background: color-mix(in oklab, var(--app-highlight) 56%, var(--app-input));
		transform: translateY(-1px);
	}

	.lobby-row:active {
		transform: translateY(1px) scale(0.995);
	}

	.lobby-row.joining {
		pointer-events: none;
		opacity: 0.72;
	}

	.lobby-row-meta {
		display: grid;
		gap: 0.22rem;
		min-width: 0;
	}

	.room-code {
		color: var(--app-text);
		font-family: var(--font-mono);
		font-size: 1.35rem;
		font-weight: 950;
		letter-spacing: 0.08em;
		line-height: 1;
	}

	.player-count {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		color: var(--app-muted);
		font-size: 0.78rem;
		font-weight: 850;
		line-height: 1;
	}

	.phase-pill {
		display: inline-flex;
		width: fit-content;
		border: 1px solid color-mix(in oklab, var(--app-accent) 38%, var(--app-border));
		border-radius: 999px;
		background: color-mix(in oklab, var(--app-accent) 12%, transparent);
		color: var(--app-accent);
		font-size: 0.68rem;
		font-weight: 950;
		line-height: 1;
		padding: 0.18rem 0.42rem;
		text-transform: uppercase;
	}

	.player-list {
		--collapsed-player-list-height: 4.9rem;

		position: relative;
		display: flex;
		flex-wrap: wrap;
		gap: 0.36rem 0.45rem;
		min-width: 0;
		max-height: var(--collapsed-player-list-height);
		overflow: hidden;
	}

	.player-list.expanded {
		max-height: none;
	}

	.player-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		min-width: 0;
		max-width: 100%;
		border: 1px solid color-mix(in oklab, var(--app-border) 58%, transparent);
		border-radius: 999px;
		background: color-mix(in oklab, var(--app-panel) 56%, transparent);
		color: var(--app-text);
		font-size: 0.84rem;
		font-weight: 850;
		line-height: 1;
		padding: 0.12rem 0.48rem 0.12rem 0.18rem;
	}

	.player-pill :global(.avatar) {
		display: inline-grid;
		place-items: center;
		width: 1.55rem;
		height: 1.55rem;
		flex: 0 0 auto;
	}

	.player-pill :global(.avatar svg) {
		width: 1.25rem;
		height: 1.25rem;
	}

	.player-pill span:last-child {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.expand-button {
		position: absolute;
		right: 0.65rem;
		display: inline-grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
	}

	.expand-button {
		top: 0.52rem;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--app-muted);
		cursor: pointer;
		transition:
			background 160ms ease,
			color 160ms ease,
			transform 180ms ease;
	}

	.expand-button:hover {
		background: color-mix(in oklab, var(--app-accent) 16%, transparent);
		color: var(--app-accent);
	}

	.expand-button[aria-expanded='true'] {
		color: var(--app-accent);
		transform: rotate(180deg);
	}

	.nearby-expand-button {
		position: absolute;
		top: 0.47rem;
		right: 0.56rem;
		display: inline-grid;
		place-items: center;
		width: 1.85rem;
		height: 1.85rem;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--app-muted);
		cursor: pointer;
		transition:
			background 160ms ease,
			color 160ms ease,
			transform 180ms ease;
	}

	.nearby-expand-button:hover {
		background: color-mix(in oklab, var(--app-accent) 16%, transparent);
		color: var(--app-accent);
	}

	.nearby-expand-button[aria-expanded='true'] {
		color: var(--app-accent);
		transform: rotate(180deg);
	}

	.empty-lobby {
		display: grid;
		place-items: center;
		min-height: 8rem;
		border: 1px dashed color-mix(in oklab, var(--app-border) 78%, transparent);
		border-radius: 0.5rem;
		color: var(--app-muted);
		font-weight: 850;
		text-align: center;
	}

	.lobby-error {
		margin: 0;
		color: var(--app-error);
		font-size: 0.9rem;
		font-weight: 850;
		text-align: center;
	}

	:global(.spin) {
		animation: spin 850ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 460px) {
		.lobby-row {
			grid-template-columns: 1fr;
			gap: 0.65rem;
		}

		.lobby-row.collapsible {
			padding-right: 3.1rem;
		}
	}
</style>
