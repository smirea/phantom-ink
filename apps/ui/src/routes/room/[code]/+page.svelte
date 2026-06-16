<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { joinRoom, openRoomEvents } from '$lib/api';
	import { parseRoomCode } from '$lib/roomCodes';
	import { LS, storageKeys } from '$lib/storage';
	import { onMount } from 'svelte';

	const roomCode = $derived(parseRoomCode(page.params.code));
	let error = $state<string | null>(null);

	onMount(() => {
		if (!roomCode) {
			void goto(`/lobby${page.url.search}${page.url.hash}`, { noScroll: true });
			return;
		}

		let events: EventSource | null = null;
		let cancelled = false;

		async function connect() {
			try {
				await joinRoom(roomCode ?? '', LS.get(storageKeys.playerName) ?? '');
				if (cancelled || !roomCode) return;
				events = openRoomEvents(
					roomCode,
					() => {
						error = null;
					},
					() => {
						error = 'Connection faded.';
					},
				);
			} catch (caught) {
				if (!cancelled) error = caught instanceof Error ? caught.message : 'Unable to join séance.';
			}
		}

		void connect();
		return () => {
			cancelled = true;
			events?.close();
		};
	});
</script>

<svelte:head>
	<title>{roomCode ?? 'Room'} | Phantom Ink</title>
</svelte:head>

<div class="room-screen" aria-label={roomCode ? `Room ${roomCode}` : 'Room'}>
	{#if error}
		<p>{error}</p>
	{/if}
</div>

<style>
	.room-screen {
		display: grid;
		place-items: center;
		min-height: clamp(12rem, 42dvh, 24rem);
	}

	p {
		margin: 0;
		color: var(--app-error);
		font-weight: 850;
	}
</style>
