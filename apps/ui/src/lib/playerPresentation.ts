import { PLAYER_COLOR_PRESETS, type PlayerColorId, type PlayerIconId } from '@repo/shared/onlineGame';
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

export const playerIconComponents = {
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
} satisfies Record<PlayerIconId, typeof Ghost>;

export function playerColorPreset(color: PlayerColorId) {
	return PLAYER_COLOR_PRESETS.find(preset => preset.id === color) ?? PLAYER_COLOR_PRESETS[0];
}
