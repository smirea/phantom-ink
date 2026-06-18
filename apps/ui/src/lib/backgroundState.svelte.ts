import { range } from 'es-toolkit';

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
	gridColumns: number;
	gridRows: number;
	spacing: number;
	gridShiftX: number;
	gridShiftY: number;
	lastAt: number;
};

export type BackgroundConfig = {
	glyphs: string[];
	specialGlyphs: string[];
	specialGlyphChance: number;
	targetAliveRatio: number;
	initialSpacing: number;
	minimumGridSpacing: number;
	maximumGridSpacing: number;
	gridPaddingCells: number;
	spacingOptions: number[];
	stateChangeDelay: [number, number];
	spacingTransitionMs: [number, number];
	directionOptions: number[];
	targetSpeed: number;
	cellLifeTickMs: number;
	maxFrameMs: number;
	spawnBaseChancePerSecond: number;
	spawnPressureChancePerSecond: number;
	decayBaseChancePerSecond: number;
	decayPressureChancePerSecond: number;
	decelerationMs: number;
	turnMs: number;
	accelerationMs: number;
	velocityRecycleThreshold: number;
	recycleMarginCells: number;
	edgePuffViewportMarginCells: number;
	edgePuffOutsidePaddingCells: number;
	spacingChangeThreshold: number;
	spacingOptionMinRatio: number;
	maxPuffs: number;
	glyphBaseSize: number;
	minGlyphScale: number;
	maxGlyphScale: number;
	glyphOpacity: [number, number];
	spawnMs: [number, number];
	naturalDecayMs: [number, number];
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

export const defaultDirectionOptions = range(0, 360, 15).map(degreesToRadians);

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
		gridColumns: number,
		gridRows: number,
		spacing: number,
		gridShiftX: number,
		gridShiftY: number,
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
			gridColumns: 0,
			gridRows: 0,
			spacing: 0,
			gridShiftX: 0,
			gridShiftY: 0,
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
		current.gridColumns = gridColumns;
		current.gridRows = gridRows;
		current.spacing = spacing;
		current.gridShiftX = gridShiftX;
		current.gridShiftY = gridShiftY;
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
		if (new URLSearchParams(window.location.search).get('debugBackground') === 'true') this.backgroundConfig(true);
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
		maximumGridSpacing: 120,
		gridPaddingCells: 4,
		spacingOptions: [54, 64, 76, 88, 104, 120],
		stateChangeDelay: [10000, 30000],
		spacingTransitionMs: [4200, 7200],
		directionOptions: defaultDirectionOptions,
		targetSpeed: 0.024,
		cellLifeTickMs: 90,
		maxFrameMs: 1000,
		spawnBaseChancePerSecond: 0.04,
		spawnPressureChancePerSecond: 1.4,
		decayBaseChancePerSecond: 0.006,
		decayPressureChancePerSecond: 0.28,
		decelerationMs: 2000,
		turnMs: 2000,
		accelerationMs: 2200,
		velocityRecycleThreshold: 0.0001,
		recycleMarginCells: 1.5,
		edgePuffViewportMarginCells: 0.7,
		edgePuffOutsidePaddingCells: 1.25,
		spacingChangeThreshold: 1,
		spacingOptionMinRatio: 0.3,
		maxPuffs: 32,
		glyphBaseSize: 50,
		minGlyphScale: 0.58,
		maxGlyphScale: 1.72,
		glyphOpacity: [0.16, 0.46],
		spawnMs: [900, 1900],
		naturalDecayMs: [120, 220],
		tapPuffCount: 18,
		tapPuffIntensity: 1.22,
		tapPuffTtlScale: 0.74,
		edgePuffCount: 4,
		edgePuffIntensity: 0.24,
		edgePuffTtlScale: 0.58,
		smokeDistance: [14, 34],
		smokeScale: [0.54, 1.04],
		smokeTtlMs: [280, 620],
		smokeOpacity: [0.54, 0.88],
		smokeEndScaleAdd: [0.12, 0.36],
		smokeEndRotation: [-18, 18],
		spinSpeedMultiplier: 1,
		targetFps: 60,
		renderPixelRatio: 1.25,
		antialias: false,
	};
}

export function degreesToRadians(value: number): number {
	return (value * Math.PI) / 180;
}
