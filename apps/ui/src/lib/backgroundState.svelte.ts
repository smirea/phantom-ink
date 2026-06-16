export type BackgroundId = 'webgl';
export type BackgroundAction =
	| { type: 'direction'; angle?: number; force?: boolean }
	| { type: 'spacing'; spacing?: number; force?: boolean }
	| { type: 'config'; key: string };
export type BackgroundMetrics = {
	frames: number;
	avgFrameMs: number;
	maxFrameMs: number;
	avgUpdateMs: number;
	avgDrawMs: number;
	cells: number;
	puffs: number;
	lastAt: number;
};

export type BackgroundConfig = {
	glyphs: string[];
	specialGlyphs: string[];
	specialGlyphChance: number;
	targetAliveRatio: number;
	initialSpacing: number;
	minimumGridSpacing: number;
	gridPaddingCells: number;
	spacingOptions: number[];
	spacingChangeDelay: [number, number];
	spacingTransitionMs: [number, number];
	directionOptions: number[];
	directionChangeDelay: [number, number];
	targetSpeed: number;
	cellLifeTickMs: number;
	maxFrameMs: number;
	spawnBaseChancePerSecond: number;
	spawnPressureChancePerSecond: number;
	decayBaseChancePerSecond: number;
	decayPressureChancePerSecond: number;
	stateChangeCooldownMs: number;
	stateRetryDelayMs: [number, number];
	decelerationMs: number;
	turnMs: number;
	accelerationMs: number;
	velocityRecycleThreshold: number;
	recycleMarginCells: number;
	edgePuffViewportMarginCells: number;
	edgePuffOutsidePaddingCells: number;
	spacingChangeThreshold: number;
	spacingOptionMinDelta: number;
	maxPuffs: number;
	glyphBaseSize: number;
	minGlyphScale: number;
	maxGlyphScale: number;
	glyphOpacity: [number, number];
	spawnMs: [number, number];
	naturalDecayMs: [number, number];
	spinDelay: [number, number];
	tapPuffCount: number;
	tapPuffIntensity: number;
	tapPuffTtlScale: number;
	edgePuffCount: number;
	edgePuffIntensity: number;
	edgePuffTtlScale: number;
	smokeDistance: [number, number];
	smokeScale: [number, number];
	smokeTtlMs: [number, number];
	smokeOpacity: [number, number];
	smokeEndScaleAdd: [number, number];
	smokeEndRotation: [number, number];
	spinSpeedMultiplier: number;
	targetFps: number;
	renderPixelRatio: number;
	antialias: boolean;
};

export type NumberConfigKey =
	| 'specialGlyphChance'
	| 'targetAliveRatio'
	| 'initialSpacing'
	| 'minimumGridSpacing'
	| 'gridPaddingCells'
	| 'targetSpeed'
	| 'cellLifeTickMs'
	| 'maxFrameMs'
	| 'spawnBaseChancePerSecond'
	| 'spawnPressureChancePerSecond'
	| 'decayBaseChancePerSecond'
	| 'decayPressureChancePerSecond'
	| 'stateChangeCooldownMs'
	| 'decelerationMs'
	| 'turnMs'
	| 'accelerationMs'
	| 'velocityRecycleThreshold'
	| 'recycleMarginCells'
	| 'edgePuffViewportMarginCells'
	| 'edgePuffOutsidePaddingCells'
	| 'spacingChangeThreshold'
	| 'spacingOptionMinDelta'
	| 'maxPuffs'
	| 'minGlyphScale'
	| 'maxGlyphScale'
	| 'tapPuffCount'
	| 'tapPuffIntensity'
	| 'tapPuffTtlScale'
	| 'edgePuffCount'
	| 'edgePuffIntensity'
	| 'edgePuffTtlScale';

export type RangeConfigKey =
	| 'spacingChangeDelay'
	| 'spacingTransitionMs'
	| 'directionChangeDelay'
	| 'stateRetryDelayMs'
	| 'glyphOpacity'
	| 'spawnMs'
	| 'naturalDecayMs'
	| 'spinDelay'
	| 'smokeDistance'
	| 'smokeScale'
	| 'smokeTtlMs'
	| 'smokeOpacity'
	| 'smokeEndScaleAdd'
	| 'smokeEndRotation';

export type NumberListConfigKey = 'spacingOptions' | 'directionOptions';
export type GlyphListConfigKey = 'glyphs' | 'specialGlyphs';

export type DebugNumberField = {
	key: NumberConfigKey;
	label: string;
	min: number;
	max: number;
	step: number;
	integer?: boolean;
};
export type DebugRangeField = {
	key: RangeConfigKey;
	label: string;
	min: number;
	max: number;
	step: number;
};
export type DebugNumberListField = {
	key: NumberListConfigKey;
	label: string;
	min: number;
	max: number;
	integer?: boolean;
	convertFromConfig?: (value: number) => number;
	convertToConfig?: (value: number) => number;
};
export type DebugGlyphListField = {
	key: GlyphListConfigKey;
	label: string;
};

type DebugRoot = typeof globalThis & {
	DEBUG?: {
		backgroundConfig?: (open?: boolean) => BackgroundConfig;
		[key: string]: unknown;
	};
};
type DebugMessage = {
	type?: string;
	open?: boolean;
};

export const defaultDirectionOptions = Array.from({ length: 24 }, (_, index) => degreesToRadians(index * 15));

export const numberConfigFields = [
	{ key: 'specialGlyphChance', label: 'specialGlyphChance', min: 0, max: 0.2, step: 0.001 },
	{ key: 'targetAliveRatio', label: 'targetAliveRatio', min: 0.05, max: 0.95, step: 0.01 },
	{ key: 'initialSpacing', label: 'initialSpacing', min: 36, max: 160, step: 1, integer: true },
	{ key: 'minimumGridSpacing', label: 'minimumGridSpacing', min: 36, max: 120, step: 1, integer: true },
	{ key: 'gridPaddingCells', label: 'gridPaddingCells', min: 2, max: 10, step: 1, integer: true },
	{ key: 'targetSpeed', label: 'targetSpeed', min: 0, max: 0.08, step: 0.001 },
	{ key: 'cellLifeTickMs', label: 'cellLifeTickMs', min: 30, max: 600, step: 10, integer: true },
	{ key: 'maxFrameMs', label: 'maxFrameMs', min: 16, max: 2000, step: 10, integer: true },
	{ key: 'spawnBaseChancePerSecond', label: 'spawnBaseChancePerSecond', min: 0, max: 1, step: 0.001 },
	{ key: 'spawnPressureChancePerSecond', label: 'spawnPressureChancePerSecond', min: 0, max: 4, step: 0.01 },
	{ key: 'decayBaseChancePerSecond', label: 'decayBaseChancePerSecond', min: 0, max: 1, step: 0.001 },
	{ key: 'decayPressureChancePerSecond', label: 'decayPressureChancePerSecond', min: 0, max: 4, step: 0.01 },
	{ key: 'stateChangeCooldownMs', label: 'stateChangeCooldownMs', min: 0, max: 60000, step: 1000, integer: true },
	{ key: 'decelerationMs', label: 'decelerationMs', min: 200, max: 9000, step: 100, integer: true },
	{ key: 'turnMs', label: 'turnMs', min: 200, max: 9000, step: 100, integer: true },
	{ key: 'accelerationMs', label: 'accelerationMs', min: 200, max: 9000, step: 100, integer: true },
	{ key: 'velocityRecycleThreshold', label: 'velocityRecycleThreshold', min: 0, max: 0.01, step: 0.0001 },
	{ key: 'recycleMarginCells', label: 'recycleMarginCells', min: 0.25, max: 6, step: 0.05 },
	{ key: 'edgePuffViewportMarginCells', label: 'edgePuffViewportMarginCells', min: 0, max: 3, step: 0.05 },
	{ key: 'edgePuffOutsidePaddingCells', label: 'edgePuffOutsidePaddingCells', min: 0, max: 4, step: 0.05 },
	{ key: 'spacingChangeThreshold', label: 'spacingChangeThreshold', min: 0, max: 12, step: 0.1 },
	{ key: 'spacingOptionMinDelta', label: 'spacingOptionMinDelta', min: 0, max: 24, step: 0.1 },
	{ key: 'maxPuffs', label: 'maxPuffs', min: 4, max: 32, step: 1, integer: true },
	{ key: 'minGlyphScale', label: 'minGlyphScale', min: 0.2, max: 2.6, step: 0.01 },
	{ key: 'maxGlyphScale', label: 'maxGlyphScale', min: 0.2, max: 3, step: 0.01 },
	{ key: 'tapPuffCount', label: 'tapPuffCount', min: 0, max: 48, step: 1, integer: true },
	{ key: 'tapPuffIntensity', label: 'tapPuffIntensity', min: 0, max: 3, step: 0.01 },
	{ key: 'tapPuffTtlScale', label: 'tapPuffTtlScale', min: 0.1, max: 2, step: 0.01 },
	{ key: 'edgePuffCount', label: 'edgePuffCount', min: 0, max: 24, step: 1, integer: true },
	{ key: 'edgePuffIntensity', label: 'edgePuffIntensity', min: 0, max: 2, step: 0.01 },
	{ key: 'edgePuffTtlScale', label: 'edgePuffTtlScale', min: 0.1, max: 2, step: 0.01 },
] satisfies readonly DebugNumberField[];

export const rangeConfigFields = [
	{ key: 'spacingChangeDelay', label: 'spacingChangeDelay', min: 1000, max: 150000, step: 1000 },
	{ key: 'spacingTransitionMs', label: 'spacingTransitionMs', min: 500, max: 18000, step: 100 },
	{ key: 'directionChangeDelay', label: 'directionChangeDelay', min: 1000, max: 180000, step: 1000 },
	{ key: 'stateRetryDelayMs', label: 'stateRetryDelayMs', min: 0, max: 10000, step: 100 },
	{ key: 'glyphOpacity', label: 'glyphOpacity', min: 0.02, max: 1, step: 0.01 },
	{ key: 'spawnMs', label: 'spawnMs', min: 50, max: 5000, step: 50 },
	{ key: 'naturalDecayMs', label: 'naturalDecayMs', min: 30, max: 2000, step: 10 },
	{ key: 'spinDelay', label: 'spinDelay', min: -60000, max: 0, step: 1000 },
	{ key: 'smokeDistance', label: 'smokeDistance', min: 0, max: 120, step: 1 },
	{ key: 'smokeScale', label: 'smokeScale', min: 0.05, max: 3, step: 0.01 },
	{ key: 'smokeTtlMs', label: 'smokeTtlMs', min: 100, max: 4000, step: 50 },
	{ key: 'smokeOpacity', label: 'smokeOpacity', min: 0.01, max: 1, step: 0.01 },
	{ key: 'smokeEndScaleAdd', label: 'smokeEndScaleAdd', min: 0, max: 3, step: 0.01 },
	{ key: 'smokeEndRotation', label: 'smokeEndRotation', min: -180, max: 180, step: 1 },
] satisfies readonly DebugRangeField[];

export const numberListConfigFields = [
	{ key: 'spacingOptions', label: 'spacingOptions', min: 36, max: 180, integer: true },
	{
		key: 'directionOptions',
		label: 'directionOptionsDeg',
		min: 0,
		max: 359,
		convertFromConfig: radiansToDegrees,
		convertToConfig: degreesToRadians,
	},
] satisfies readonly DebugNumberListField[];

export const glyphListConfigFields = [
	{ key: 'glyphs', label: 'glyphs' },
	{ key: 'specialGlyphs', label: 'specialGlyphs' },
] satisfies readonly DebugGlyphListField[];

export class BackgroundState {
	config = $state<BackgroundConfig>(createDefaultBackgroundConfig());
	configOpen = $state(false);
	rendererKey = $state(0);
	metrics: Partial<Record<BackgroundId, BackgroundMetrics>> = {};

	#listeners = new Set<(action: BackgroundAction) => void>();

	backgroundConfig(open = true): BackgroundConfig {
		this.configOpen = open;
		if (typeof document !== 'undefined')
			document.documentElement.dataset.backgroundConfigOpen = open ? 'true' : 'false';
		return this.config;
	}

	triggerDirectionChange(angle?: number): void {
		this.emit({ type: 'direction', angle, force: true });
	}

	triggerSpacingChange(spacing?: number): void {
		this.emit({ type: 'spacing', spacing, force: true });
	}

	notifyConfigChanged(key: string): void {
		if (key === 'antialias') this.rendererKey += 1;
		this.emit({ type: 'config', key });
	}

	onAction(listener: (action: BackgroundAction) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	resetMetrics(id: BackgroundId): void {
		delete this.metrics[id];
		if (typeof document !== 'undefined') delete document.documentElement.dataset.backgroundMetrics;
	}

	recordFrame(
		id: BackgroundId,
		frameMs: number,
		updateMs: number,
		drawMs: number,
		cells: number,
		puffs: number,
		now: number,
	): void {
		const current = this.metrics[id] ?? {
			frames: 0,
			avgFrameMs: 0,
			maxFrameMs: 0,
			avgUpdateMs: 0,
			avgDrawMs: 0,
			cells: 0,
			puffs: 0,
			lastAt: 0,
		};
		const frames = current.frames + 1;
		const weight = frames === 1 ? 1 : 0.08;
		current.frames = frames;
		current.avgFrameMs = current.avgFrameMs * (1 - weight) + frameMs * weight;
		current.maxFrameMs = Math.max(current.maxFrameMs, frameMs);
		current.avgUpdateMs = current.avgUpdateMs * (1 - weight) + updateMs * weight;
		current.avgDrawMs = current.avgDrawMs * (1 - weight) + drawMs * weight;
		current.cells = cells;
		current.puffs = puffs;
		current.lastAt = now;
		this.metrics[id] = current;

		if (typeof document !== 'undefined' && frames % 30 === 0) {
			document.documentElement.dataset.backgroundMetrics = JSON.stringify({
				active: id,
				...current,
				avgFps: current.avgFrameMs > 0 ? 1000 / current.avgFrameMs : 0,
			});
		}
	}

	installDebug(): () => void {
		if (typeof window === 'undefined') return () => {};
		const root = window as DebugRoot;
		const previous = root.DEBUG?.backgroundConfig;
		const previousReady = document.documentElement.dataset.backgroundDebug;
		root.DEBUG ??= {};
		const backgroundConfig = (open = true) => this.backgroundConfig(open);
		const openFromEvent = (event: Event) => {
			const detail = (event as CustomEvent<{ open?: boolean }>).detail;
			this.backgroundConfig(detail?.open ?? true);
		};
		const openFromMessage = (event: MessageEvent<DebugMessage>) => {
			if (event.source !== window || event.data?.type !== 'phantom-ink:background-config') return;
			this.backgroundConfig(event.data.open ?? true);
		};
		root.DEBUG.backgroundConfig = backgroundConfig;
		document.documentElement.dataset.backgroundDebug = 'ready';
		window.addEventListener('phantom-ink:background-config', openFromEvent);
		window.addEventListener('message', openFromMessage);
		if (new URLSearchParams(window.location.search).has('backgroundConfig')) this.backgroundConfig(true);
		return () => {
			if (!root.DEBUG || root.DEBUG.backgroundConfig !== backgroundConfig) return;
			if (previous) root.DEBUG.backgroundConfig = previous;
			else delete root.DEBUG.backgroundConfig;
			if (previousReady === undefined) delete document.documentElement.dataset.backgroundDebug;
			else document.documentElement.dataset.backgroundDebug = previousReady;
			delete document.documentElement.dataset.backgroundConfigOpen;
			window.removeEventListener('phantom-ink:background-config', openFromEvent);
			window.removeEventListener('message', openFromMessage);
		};
	}

	private emit(action: BackgroundAction): void {
		for (const listener of this.#listeners) listener(action);
	}
}

export function createDefaultBackgroundConfig(): BackgroundConfig {
	return {
		glyphs: 'PHANTOMINKSILENCIOSEANCEGHOSTWRITERMOONSUNOBJECTCLUE'.split(''),
		specialGlyphs: ['☺', '☻', '☹'],
		specialGlyphChance: 0.02,
		targetAliveRatio: 0.85,
		initialSpacing: 64,
		minimumGridSpacing: 54,
		gridPaddingCells: 4,
		spacingOptions: [54, 64, 76, 88],
		spacingChangeDelay: [42000, 72000],
		spacingTransitionMs: [4200, 7200],
		directionOptions: defaultDirectionOptions,
		directionChangeDelay: [48000, 90000],
		targetSpeed: 0.024,
		cellLifeTickMs: 90,
		maxFrameMs: 1000,
		spawnBaseChancePerSecond: 0.04,
		spawnPressureChancePerSecond: 1.4,
		decayBaseChancePerSecond: 0.006,
		decayPressureChancePerSecond: 0.28,
		stateChangeCooldownMs: 10000,
		stateRetryDelayMs: [800, 1800],
		decelerationMs: 1800,
		turnMs: 1500,
		accelerationMs: 2200,
		velocityRecycleThreshold: 0.0001,
		recycleMarginCells: 1.5,
		edgePuffViewportMarginCells: 0.7,
		edgePuffOutsidePaddingCells: 1.25,
		spacingChangeThreshold: 1,
		spacingOptionMinDelta: 1,
		maxPuffs: 32,
		glyphBaseSize: 50,
		minGlyphScale: 0.58,
		maxGlyphScale: 1.72,
		glyphOpacity: [0.16, 0.46],
		spawnMs: [900, 1900],
		naturalDecayMs: [120, 220],
		spinDelay: [-20000, 0],
		tapPuffCount: 18,
		tapPuffIntensity: 1.35,
		tapPuffTtlScale: 0.46,
		edgePuffCount: 4,
		edgePuffIntensity: 0.34,
		edgePuffTtlScale: 0.78,
		smokeDistance: [9, 28],
		smokeScale: [0.42, 1.1],
		smokeTtlMs: [760, 1500],
		smokeOpacity: [0.16, 0.5],
		smokeEndScaleAdd: [0.34, 0.78],
		smokeEndRotation: [-24, 24],
		spinSpeedMultiplier: 1,
		targetFps: 60,
		renderPixelRatio: 1.25,
		antialias: false,
	};
}

export function parseNumberList(value: string): number[] {
	return value
		.split(',')
		.map(item => Number(item.trim()))
		.filter(Number.isFinite);
}

export function uniqueNumbers(values: number[]): number[] {
	return [...new Set(values)].sort((a, b) => a - b);
}

export function formatNumberList(values: number[]): string {
	return values.map(formatDebugNumber).join(', ');
}

export function parseGlyphList(value: string): string[] {
	const trimmed = value.trim();
	if (!trimmed) return [];
	if (trimmed.includes(','))
		return trimmed
			.split(',')
			.map(item => item.trim())
			.filter(Boolean);
	return Array.from(trimmed).filter(char => !/\s/.test(char));
}

export function formatGlyphList(values: string[]): string {
	return values.join('');
}

export function formatDebugNumber(value: number): string {
	const rounded = Math.round(value * 1000) / 1000;
	return `${rounded}`;
}

export function degreesToRadians(value: number): number {
	return (value * Math.PI) / 180;
}

export function radiansToDegrees(value: number): number {
	return (value * 180) / Math.PI;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
