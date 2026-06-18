export const PLAYER_COLOR_PRESETS = [
	{ id: 'ectoplasm', label: 'Ectoplasm', value: '#9ee6cf' },
	{ id: 'willowisp', label: 'Will-o-wisp', value: '#8ac7ff' },
	{ id: 'moonmilk', label: 'Moonmilk', value: '#d8d2ff' },
	{ id: 'haunt', label: 'Haunt', value: '#b990ff' },
	{ id: 'velvet', label: 'Velvet', value: '#d782ba' },
	{ id: 'bloodink', label: 'Blood ink', value: '#d85b68' },
	{ id: 'pumpkin', label: 'Pumpkin', value: '#e58a45' },
	{ id: 'brass', label: 'Brass', value: '#d0a45f' },
	{ id: 'moss', label: 'Moss', value: '#92b86d' },
	{ id: 'lagoon', label: 'Lagoon', value: '#55b7b2' },
	{ id: 'ash', label: 'Ash', value: '#a7a4ac' },
	{ id: 'bone', label: 'Bone', value: '#e3d7b8' },
] as const;

export const PLAYER_ICON_PRESETS = [
	{ id: 'ghost', label: 'Ghost' },
	{ id: 'skull', label: 'Skull' },
	{ id: 'venetian-mask', label: 'Mask' },
	{ id: 'drama', label: 'Drama' },
	{ id: 'cat', label: 'Cat' },
	{ id: 'rabbit', label: 'Rabbit' },
	{ id: 'rat', label: 'Rat' },
	{ id: 'snail', label: 'Snail' },
	{ id: 'bug', label: 'Bug' },
	{ id: 'worm', label: 'Worm' },
	{ id: 'fish', label: 'Fish' },
	{ id: 'angry', label: 'Grump' },
] as const;

export const DEFAULT_PLAYER_COLOR = PLAYER_COLOR_PRESETS[0].id;
export const DEFAULT_PLAYER_ICON = PLAYER_ICON_PRESETS[0].id;

export type PlayerColorId = (typeof PLAYER_COLOR_PRESETS)[number]['id'];
export type PlayerIconId = (typeof PLAYER_ICON_PRESETS)[number]['id'];
