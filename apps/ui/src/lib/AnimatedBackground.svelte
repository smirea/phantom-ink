<script lang="ts">
	import { onMount } from 'svelte';

	type CellStatus = 'alive' | 'spawning' | 'dying' | 'dead';
	type GridCell = {
		key: string;
		char: string;
		column: number;
		row: number;
		opacity: number;
		scale: number;
		spinClass: string;
		spinReverse: boolean;
		spinDelay: number;
		visibility: number;
		status: CellStatus;
		spawnMs: number;
		decayMs: number;
		spawnDoneAt: number;
		deathAt: number;
		wasOnscreen: boolean;
		edgePuffTransition: number;
	};
	type SmokePuff = {
		id: number;
		x: number;
		y: number;
		dx: number;
		dy: number;
		rotation: number;
		endRotation: number;
		opacity: number;
		scale: number;
		endScale: number;
		ttl: number;
		removeAt: number;
	};
	type DirectionPhase = 'cruise' | 'decelerating' | 'turning' | 'accelerating';
	type DirectionState = {
		angle: number;
		displayAngle: number;
		fromAngle: number;
		targetAngle: number;
		speed: number;
		speedFrom: number;
		phase: DirectionPhase;
		phaseStartedAt: number;
		phaseDuration: number;
		nextChangeAt: number;
	};
	type SpacingState = {
		current: number;
		from: number;
		target: number;
		startedAt: number;
		duration: number;
		nextChangeAt: number;
		active: boolean;
		transitionId: number;
	};
	type BackgroundConfig = {
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
		minGlyphScale: number;
		maxGlyphScale: number;
		glyphOpacity: [number, number];
		spawnMs: [number, number];
		naturalDecayMs: [number, number];
		spinDelay: [number, number];
		naturalPuffCount: number;
		naturalPuffIntensity: number;
		naturalPuffTtlScale: number;
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
	};
	type DebugApi = {
		backgroundConfig: (open?: boolean) => BackgroundConfig;
	};
	type DebugRoot = typeof globalThis & {
		DEBUG?: Partial<DebugApi> & Record<string, unknown>;
	};
	type NumberConfigKey =
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
		| 'naturalPuffCount'
		| 'naturalPuffIntensity'
		| 'naturalPuffTtlScale'
		| 'tapPuffCount'
		| 'tapPuffIntensity'
		| 'tapPuffTtlScale'
		| 'edgePuffCount'
		| 'edgePuffIntensity'
		| 'edgePuffTtlScale';
	type RangeConfigKey =
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
	type NumberListConfigKey = 'spacingOptions' | 'directionOptions';
	type GlyphListConfigKey = 'glyphs' | 'specialGlyphs';
	type DebugNumberField = {
		key: NumberConfigKey;
		label: string;
		min: number;
		max: number;
		step: number;
		integer?: boolean;
	};
	type DebugRangeField = {
		key: RangeConfigKey;
		label: string;
		min: number;
		max: number;
		step: number;
	};
	type DebugNumberListField = {
		key: NumberListConfigKey;
		label: string;
		min: number;
		max: number;
		integer?: boolean;
		convertFromConfig?: (value: number) => number;
		convertToConfig?: (value: number) => number;
	};
	type DebugGlyphListField = {
		key: GlyphListConfigKey;
		label: string;
	};

	const browser = typeof window !== 'undefined';
	const defaultDirectionOptions = Array.from({ length: 24 }, (_, index) => degreesToRadians(index * 15));
	const spinClasses = ['spin-0', 'spin-1', 'spin-2', 'spin-3', 'spin-4', 'spin-5'] as const;
	const numberConfigFields = [
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
		{ key: 'maxPuffs', label: 'maxPuffs', min: 12, max: 240, step: 1, integer: true },
		{ key: 'minGlyphScale', label: 'minGlyphScale', min: 0.2, max: 2.6, step: 0.01 },
		{ key: 'maxGlyphScale', label: 'maxGlyphScale', min: 0.2, max: 3, step: 0.01 },
		{ key: 'naturalPuffCount', label: 'naturalPuffCount', min: 0, max: 24, step: 1, integer: true },
		{ key: 'naturalPuffIntensity', label: 'naturalPuffIntensity', min: 0, max: 2, step: 0.01 },
		{ key: 'naturalPuffTtlScale', label: 'naturalPuffTtlScale', min: 0.1, max: 2, step: 0.01 },
		{ key: 'tapPuffCount', label: 'tapPuffCount', min: 0, max: 48, step: 1, integer: true },
		{ key: 'tapPuffIntensity', label: 'tapPuffIntensity', min: 0, max: 3, step: 0.01 },
		{ key: 'tapPuffTtlScale', label: 'tapPuffTtlScale', min: 0.1, max: 2, step: 0.01 },
		{ key: 'edgePuffCount', label: 'edgePuffCount', min: 0, max: 24, step: 1, integer: true },
		{ key: 'edgePuffIntensity', label: 'edgePuffIntensity', min: 0, max: 2, step: 0.01 },
		{ key: 'edgePuffTtlScale', label: 'edgePuffTtlScale', min: 0.1, max: 2, step: 0.01 },
	] satisfies readonly DebugNumberField[];
	const rangeConfigFields = [
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
	const numberListConfigFields = [
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
	const glyphListConfigFields = [
		{ key: 'glyphs', label: 'glyphs' },
		{ key: 'specialGlyphs', label: 'specialGlyphs' },
	] satisfies readonly DebugGlyphListField[];
	const backgroundConfig = $state<BackgroundConfig>({
		glyphs: 'PHANTOMINKSILENCIOSEANCEGHOSTWRITERMOONSUNOBJECTCLUE'.split(''),
		specialGlyphs: ['☺', '☻', '☹'],
		specialGlyphChance: 0.02,
		targetAliveRatio: 0.7,
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
		decayBaseChancePerSecond: 0.012,
		decayPressureChancePerSecond: 0.52,
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
		maxPuffs: 96,
		minGlyphScale: 0.58,
		maxGlyphScale: 1.72,
		glyphOpacity: [0.16, 0.46],
		spawnMs: [900, 1900],
		naturalDecayMs: [120, 220],
		spinDelay: [-20000, 0],
		naturalPuffCount: 6,
		naturalPuffIntensity: 0.48,
		naturalPuffTtlScale: 0.7,
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
	});

	let cells = $state<GridCell[]>([]);
	let puffs = $state<SmokePuff[]>([]);
	let letterGridElement: HTMLDivElement | undefined = undefined;
	let smokeId = 0;
	let cellId = 0;
	let gridShiftX = 0;
	let gridShiftY = 0;
	let gridColumns = 0;
	let gridRows = 0;
	let minColumn = 0;
	let maxColumn = -1;
	let minRow = 0;
	let maxRow = -1;
	let nextStateChangeAllowedAt = 0;
	let nextCellLifeTickAt = 0;
	let debugBackgroundConfigOpen = $state(false);
	let directionState = $state<DirectionState>(createDirectionState(0));
	let spacingState = $state<SpacingState>(createSpacingState(0));
	let numberListDrafts = $state<Record<NumberListConfigKey, string>>({
		spacingOptions: formatNumberList(backgroundConfig.spacingOptions),
		directionOptions: formatNumberList(backgroundConfig.directionOptions.map(radiansToDegrees)),
	});
	let glyphListDrafts = $state<Record<GlyphListConfigKey, string>>({
		glyphs: formatGlyphList(backgroundConfig.glyphs),
		specialGlyphs: formatGlyphList(backgroundConfig.specialGlyphs),
	});
	const DEBUG: DebugApi = {
		backgroundConfig(open = true) {
			debugBackgroundConfigOpen = open;
			return backgroundConfig;
		},
	};

	if (browser) {
		const root = globalThis as DebugRoot;
		root.DEBUG ??= {};
		root.DEBUG.backgroundConfig = DEBUG.backgroundConfig;
	}

	onMount(() => {
		const now = performance.now();
		directionState = createDirectionState(now);
		spacingState = createSpacingState(now);
		ensureCellCapacity(window.innerWidth, window.innerHeight, true);
		captureOnscreenState();
		applyGridTransform();
		nextCellLifeTickAt = now + backgroundConfig.cellLifeTickMs;

		let frame = 0;
		let lastTime = now;

		const tick = (now: number) => {
			const elapsedMs = Math.max(0, Math.min(backgroundConfig.maxFrameMs, now - lastTime));
			lastTime = now;

			updateSpacing(now);
			updateDirection(now);
			updateGridMotion(elapsedMs);
			ensureCellCapacity(window.innerWidth, window.innerHeight, false);
			checkSpacingExpansionEdges();
			recycleGridEdges(window.innerWidth, window.innerHeight);
			updateCellLife(now);
			applyGridTransform();
			frame = window.requestAnimationFrame(tick);
		};

		frame = window.requestAnimationFrame(tick);
		return () => window.cancelAnimationFrame(frame);
	});

	function ensureCellCapacity(width: number, height: number, seedAlive: boolean): void {
		const required = getRequiredGridSize(width, height);
		if (cells.length === 0) {
			initializeCells(required.columns, required.rows, seedAlive);
			return;
		}

		while (gridColumns < required.columns) {
			addColumn(gridColumns % 2 === 0 ? 'left' : 'right', seedAlive);
		}
		while (gridRows < required.rows) {
			addRow(gridRows % 2 === 0 ? 'top' : 'bottom', seedAlive);
		}
	}

	function initializeCells(columns: number, rows: number, seedAlive: boolean): void {
		minColumn = -backgroundConfig.gridPaddingCells;
		maxColumn = minColumn + columns - 1;
		minRow = -backgroundConfig.gridPaddingCells;
		maxRow = minRow + rows - 1;
		gridColumns = columns;
		gridRows = rows;

		const nextCells: GridCell[] = [];
		for (let row = minRow; row <= maxRow; row += 1) {
			for (let column = minColumn; column <= maxColumn; column += 1) {
				nextCells.push(createGridCell(column, row, seedAlive && Math.random() < backgroundConfig.targetAliveRatio));
			}
		}
		cells = nextCells;
	}

	function addColumn(side: 'left' | 'right', seedAlive: boolean): void {
		const column = side === 'left' ? minColumn - 1 : maxColumn + 1;
		const nextCells: GridCell[] = [];
		for (let row = minRow; row <= maxRow; row += 1) {
			nextCells.push(createGridCell(column, row, seedAlive && Math.random() < backgroundConfig.targetAliveRatio));
		}
		cells = [...cells, ...nextCells];
		if (side === 'left') minColumn = column;
		else maxColumn = column;
		gridColumns += 1;
	}

	function addRow(side: 'top' | 'bottom', seedAlive: boolean): void {
		const row = side === 'top' ? minRow - 1 : maxRow + 1;
		const nextCells: GridCell[] = [];
		for (let column = minColumn; column <= maxColumn; column += 1) {
			nextCells.push(createGridCell(column, row, seedAlive && Math.random() < backgroundConfig.targetAliveRatio));
		}
		cells = [...cells, ...nextCells];
		if (side === 'top') minRow = row;
		else maxRow = row;
		gridRows += 1;
	}

	function createGridCell(column: number, row: number, seedAlive: boolean): GridCell {
		const char = chooseGlyph();
		return {
			key: `cell-${(cellId += 1)}`,
			char,
			column,
			row,
			opacity: randomRange(backgroundConfig.glyphOpacity),
			scale: glyphScale(char),
			spinClass: spinClasses[Math.floor(Math.random() * spinClasses.length)],
			spinReverse: Math.random() < 0.5,
			spinDelay: randomRange(backgroundConfig.spinDelay),
			visibility: seedAlive ? 1 : 0,
			status: seedAlive ? 'alive' : 'dead',
			spawnMs: randomRange(backgroundConfig.spawnMs),
			decayMs: randomRange(backgroundConfig.naturalDecayMs),
			spawnDoneAt: 0,
			deathAt: 0,
			wasOnscreen: false,
			edgePuffTransition: 0,
		};
	}

	function updateCellLife(now: number): void {
		if (now < nextCellLifeTickAt) return;
		nextCellLifeTickAt = now + backgroundConfig.cellLifeTickMs;
		puffs = puffs.filter(puff => now < puff.removeAt);

		const total = Math.max(1, cells.length);
		const living = cells.filter(cell => cell.status === 'alive' || cell.status === 'spawning').length;
		const occupancy = living / total;
		const tickSeconds = backgroundConfig.cellLifeTickMs / 1000;
		const spawnPressure = Math.max(
			0,
			(backgroundConfig.targetAliveRatio - occupancy) / backgroundConfig.targetAliveRatio,
		);
		const decayPressure = Math.max(
			0,
			(occupancy - backgroundConfig.targetAliveRatio) / (1 - backgroundConfig.targetAliveRatio),
		);

		for (const cell of cells) {
			if (cell.status === 'spawning') {
				if (now >= cell.spawnDoneAt) cell.status = 'alive';
			} else if (cell.status === 'dying') {
				if (now >= cell.deathAt) killCell(cell);
			} else if (cell.status === 'dead') {
				if (
					Math.random() <
					(backgroundConfig.spawnBaseChancePerSecond + spawnPressure * backgroundConfig.spawnPressureChancePerSecond) *
						tickSeconds
				) {
					spawnCell(cell);
				}
			} else if (
				Math.random() <
				(backgroundConfig.decayBaseChancePerSecond + decayPressure * backgroundConfig.decayPressureChancePerSecond) *
					tickSeconds
			) {
				fadeCell(cell);
			}
		}
	}

	function spawnCell(cell: GridCell): void {
		cell.char = chooseGlyph();
		cell.opacity = randomRange(backgroundConfig.glyphOpacity);
		cell.scale = glyphScale(cell.char);
		cell.spinClass = spinClasses[Math.floor(Math.random() * spinClasses.length)];
		cell.spinReverse = Math.random() < 0.5;
		cell.spinDelay = randomRange(backgroundConfig.spinDelay);
		cell.spawnMs = randomRange(backgroundConfig.spawnMs);
		cell.decayMs = randomRange(backgroundConfig.naturalDecayMs);
		cell.spawnDoneAt = performance.now() + cell.spawnMs;
		cell.deathAt = 0;
		cell.visibility = 1;
		cell.status = 'spawning';
	}

	function fadeCell(cell: GridCell): void {
		if (cell.status !== 'alive') return;

		cell.visibility = 0;
		cell.decayMs = randomRange(backgroundConfig.naturalDecayMs);
		cell.deathAt = performance.now() + cell.decayMs;
		cell.status = 'dying';
		const point = cellCenter(cell);
		spawnSmoke(
			point.x,
			point.y,
			backgroundConfig.naturalPuffCount,
			backgroundConfig.naturalPuffIntensity,
			backgroundConfig.naturalPuffTtlScale,
		);
	}

	function popCell(key: string, event: PointerEvent): void {
		event.preventDefault();
		event.stopPropagation();
		const cell = cells.find(item => item.key === key);
		if (!cell || cell.status === 'dead') return;

		const point = cellCenter(cell);
		spawnSmoke(
			point.x,
			point.y,
			backgroundConfig.tapPuffCount,
			backgroundConfig.tapPuffIntensity,
			backgroundConfig.tapPuffTtlScale,
		);
		killCell(cell);
	}

	function killCell(cell: GridCell): void {
		cell.visibility = 0;
		cell.status = 'dead';
		cell.spawnDoneAt = 0;
		cell.deathAt = 0;
	}

	function updateSpacing(now: number): void {
		if (!spacingState.active && now >= spacingState.nextChangeAt) {
			startSpacingChange(now);
		}

		if (!spacingState.active) return;

		const progress = smoothProgress((now - spacingState.startedAt) / spacingState.duration);
		spacingState.current = spacingState.from + (spacingState.target - spacingState.from) * progress;
		if (progress >= 1) {
			spacingState.current = spacingState.target;
			spacingState.active = false;
			spacingState.nextChangeAt = now + randomRange(backgroundConfig.spacingChangeDelay);
		}
	}

	function updateDirection(now: number): void {
		if (directionState.phase === 'cruise' && now >= directionState.nextChangeAt) {
			startDirectionChange(now);
		}

		if (directionState.phase === 'decelerating') {
			const progress = smoothProgress((now - directionState.phaseStartedAt) / directionState.phaseDuration);
			directionState.speed = directionState.speedFrom * (1 - progress);
			if (progress >= 1) {
				directionState.speed = 0;
				directionState.phase = 'turning';
				directionState.phaseStartedAt = now;
				directionState.phaseDuration = backgroundConfig.turnMs;
			}
		} else if (directionState.phase === 'turning') {
			const progress = smoothProgress((now - directionState.phaseStartedAt) / directionState.phaseDuration);
			directionState.displayAngle = lerpAngle(directionState.fromAngle, directionState.targetAngle, progress);
			if (progress >= 1) {
				directionState.angle = directionState.targetAngle;
				directionState.displayAngle = directionState.targetAngle;
				directionState.phase = 'accelerating';
				directionState.phaseStartedAt = now;
				directionState.phaseDuration = backgroundConfig.accelerationMs;
			}
		} else if (directionState.phase === 'accelerating') {
			const progress = smoothProgress((now - directionState.phaseStartedAt) / directionState.phaseDuration);
			directionState.speed = backgroundConfig.targetSpeed * progress;
			if (progress >= 1) {
				directionState.speed = backgroundConfig.targetSpeed;
				directionState.phase = 'cruise';
				directionState.nextChangeAt = now + randomRange(backgroundConfig.directionChangeDelay);
			}
		}

		if (directionState.phase === 'cruise') {
			directionState.displayAngle = directionState.angle;
			directionState.speed = backgroundConfig.targetSpeed;
		}
	}

	function updateGridMotion(elapsedMs: number): void {
		if (directionState.phase === 'turning') return;
		gridShiftX += Math.cos(directionState.angle) * directionState.speed * elapsedMs;
		gridShiftY += Math.sin(directionState.angle) * directionState.speed * elapsedMs;
	}

	function applyGridTransform(): void {
		if (!letterGridElement) return;
		letterGridElement.style.transform = `translate3d(${gridShiftX}px, ${gridShiftY}px, 0)`;
	}

	function recycleGridEdges(width: number, height: number): void {
		if (gridColumns <= 0 || gridRows <= 0) return;

		const spacing = spacingState.current;
		const margin = spacing * backgroundConfig.recycleMarginCells;
		const velocityX = Math.cos(directionState.angle) * directionState.speed;
		const velocityY = Math.sin(directionState.angle) * directionState.speed;
		const threshold = backgroundConfig.velocityRecycleThreshold;

		if (velocityX > threshold) {
			while (gridShiftX + maxColumn * spacing > width + margin) {
				recycleColumn(maxColumn, minColumn - 1);
			}
		} else if (velocityX < -threshold) {
			while (gridShiftX + (minColumn + 1) * spacing < -margin) {
				recycleColumn(minColumn, maxColumn + 1);
			}
		}

		if (velocityY > threshold) {
			while (gridShiftY + maxRow * spacing > height + margin) {
				recycleRow(maxRow, minRow - 1);
			}
		} else if (velocityY < -threshold) {
			while (gridShiftY + (minRow + 1) * spacing < -margin) {
				recycleRow(minRow, maxRow + 1);
			}
		}
	}

	function recycleColumn(fromColumn: number, toColumn: number): void {
		for (const cell of cells) {
			if (cell.column === fromColumn) {
				cell.column = toColumn;
				cell.wasOnscreen = false;
				cell.edgePuffTransition = 0;
			}
		}

		if (fromColumn === maxColumn && toColumn < minColumn) {
			minColumn = toColumn;
			maxColumn -= 1;
		} else if (fromColumn === minColumn && toColumn > maxColumn) {
			minColumn += 1;
			maxColumn = toColumn;
		}
	}

	function recycleRow(fromRow: number, toRow: number): void {
		for (const cell of cells) {
			if (cell.row === fromRow) {
				cell.row = toRow;
				cell.wasOnscreen = false;
				cell.edgePuffTransition = 0;
			}
		}

		if (fromRow === maxRow && toRow < minRow) {
			minRow = toRow;
			maxRow -= 1;
		} else if (fromRow === minRow && toRow > maxRow) {
			minRow += 1;
			maxRow = toRow;
		}
	}

	function spawnSmoke(x: number, y: number, count: number, intensity: number, ttlScale: number): void {
		const now = performance.now();
		const nextPuffs = Array.from({ length: count }, () => {
			const angle = Math.random() * Math.PI * 2;
			const distance = randomRange(backgroundConfig.smokeDistance) * intensity;
			const scale = randomRange(backgroundConfig.smokeScale) * intensity;
			const ttl = randomRange(backgroundConfig.smokeTtlMs) * ttlScale;
			return {
				id: (smokeId += 1),
				x,
				y,
				dx: Math.cos(angle) * distance,
				dy: Math.sin(angle) * distance,
				rotation: Math.random() * 360,
				endRotation: randomRange(backgroundConfig.smokeEndRotation),
				opacity: randomRange(backgroundConfig.smokeOpacity) * intensity,
				scale,
				endScale: scale + randomRange(backgroundConfig.smokeEndScaleAdd) * intensity,
				ttl,
				removeAt: now + ttl,
			};
		});
		puffs = [...puffs, ...nextPuffs].slice(-backgroundConfig.maxPuffs);
	}

	function createDirectionState(now: number): DirectionState {
		return {
			angle: 0,
			displayAngle: 0,
			fromAngle: 0,
			targetAngle: 0,
			speed: backgroundConfig.targetSpeed,
			speedFrom: backgroundConfig.targetSpeed,
			phase: 'cruise',
			phaseStartedAt: now,
			phaseDuration: 0,
			nextChangeAt: now + randomRange(backgroundConfig.directionChangeDelay),
		};
	}

	function createSpacingState(now: number): SpacingState {
		const initialSpacing = Math.max(backgroundConfig.minimumGridSpacing, backgroundConfig.initialSpacing);
		return {
			current: initialSpacing,
			from: initialSpacing,
			target: initialSpacing,
			startedAt: now,
			duration: 0,
			nextChangeAt: now + randomRange(backgroundConfig.spacingChangeDelay),
			active: false,
			transitionId: 0,
		};
	}

	function chooseDirection(current: number): number {
		const minimumTurn = degreesToRadians(30 + randomInt(0, 10) * 15);
		const options = backgroundConfig.directionOptions.filter(
			angle => Math.abs(shortestAngle(current, angle)) >= minimumTurn,
		);
		if (options.length > 0) return options[Math.floor(Math.random() * options.length)];

		const fallback = backgroundConfig.directionOptions.reduce(
			(best, angle) => {
				const distance = Math.abs(shortestAngle(current, angle));
				return distance > best.distance ? { angle, distance } : best;
			},
			{ angle: 0, distance: 0 },
		);
		return fallback.angle;
	}

	function chooseGlyph(): string {
		const specialGlyphs = backgroundConfig.specialGlyphs;
		if (specialGlyphs.length > 0 && Math.random() < backgroundConfig.specialGlyphChance) {
			return specialGlyphs[Math.floor(Math.random() * specialGlyphs.length)];
		}
		return backgroundConfig.glyphs[Math.floor(Math.random() * backgroundConfig.glyphs.length)] ?? 'P';
	}

	function glyphScale(char: string): number {
		return backgroundConfig.specialGlyphs.includes(char)
			? backgroundConfig.maxGlyphScale
			: randomBetween(backgroundConfig.minGlyphScale, backgroundConfig.maxGlyphScale);
	}

	function chooseSpacing(current: number): number {
		const options = backgroundConfig.spacingOptions.filter(
			spacing => Math.abs(spacing - current) > backgroundConfig.spacingOptionMinDelta,
		);
		return options[Math.floor(Math.random() * options.length)] ?? backgroundConfig.initialSpacing;
	}

	function smoothProgress(value: number): number {
		const progress = Math.min(1, Math.max(0, value));
		return progress * progress * (3 - 2 * progress);
	}

	function lerpAngle(from: number, to: number, progress: number): number {
		return from + shortestAngle(from, to) * progress;
	}

	function shortestAngle(from: number, to: number): number {
		return Math.atan2(Math.sin(to - from), Math.cos(to - from));
	}

	function getRequiredGridSize(width: number, height: number): { columns: number; rows: number } {
		return {
			columns: Math.ceil(width / backgroundConfig.minimumGridSpacing) + backgroundConfig.gridPaddingCells * 2,
			rows: Math.ceil(height / backgroundConfig.minimumGridSpacing) + backgroundConfig.gridPaddingCells * 2,
		};
	}

	function cellCenter(cell: GridCell): { x: number; y: number } {
		const spacing = spacingState.current;
		return {
			x: (cell.column + 0.5) * spacing,
			y: (cell.row + 0.5) * spacing,
		};
	}

	function cellScreenPoint(cell: GridCell): { x: number; y: number } {
		const point = cellCenter(cell);
		return {
			x: gridShiftX + point.x,
			y: gridShiftY + point.y,
		};
	}

	function screenToGrid(x: number, y: number): { x: number; y: number } {
		return {
			x: x - gridShiftX,
			y: y - gridShiftY,
		};
	}

	function isNearViewportPoint(x: number, y: number, width: number, height: number, spacing: number): boolean {
		const margin = spacing * backgroundConfig.edgePuffViewportMarginCells;
		return x > -margin && x < width + margin && y > -margin && y < height + margin;
	}

	function cellIsNearViewport(cell: GridCell): boolean {
		if (typeof window === 'undefined') return true;
		const point = cellScreenPoint(cell);
		return isNearViewportPoint(point.x, point.y, window.innerWidth, window.innerHeight, spacingState.current);
	}

	function captureOnscreenState(): void {
		for (const cell of cells) {
			cell.wasOnscreen = cellIsNearViewport(cell);
			cell.edgePuffTransition = 0;
		}
	}

	function checkSpacingExpansionEdges(): void {
		if (!spacingState.active || spacingState.target <= spacingState.from || typeof window === 'undefined') return;

		const width = window.innerWidth;
		const height = window.innerHeight;
		for (const cell of cells) {
			if (cell.status === 'dead') continue;

			const point = cellScreenPoint(cell);
			const onscreen = isNearViewportPoint(point.x, point.y, width, height, spacingState.current);
			if (cell.wasOnscreen && !onscreen && cell.edgePuffTransition !== spacingState.transitionId) {
				const edgePoint = outsidePointNearViewport(point.x, point.y, width, height, spacingState.current);
				const gridPoint = screenToGrid(edgePoint.x, edgePoint.y);
				cell.edgePuffTransition = spacingState.transitionId;
				spawnSmoke(
					gridPoint.x,
					gridPoint.y,
					backgroundConfig.edgePuffCount,
					backgroundConfig.edgePuffIntensity,
					backgroundConfig.edgePuffTtlScale,
				);
				killCell(cell);
			}
			cell.wasOnscreen = onscreen;
		}
	}

	function outsidePointNearViewport(
		x: number,
		y: number,
		width: number,
		height: number,
		spacing: number,
	): { x: number; y: number } {
		const padded = spacing * backgroundConfig.edgePuffOutsidePaddingCells;
		const clampedX = Math.min(width, Math.max(0, x));
		const clampedY = Math.min(height, Math.max(0, y));
		const edges = [
			{ x: -padded, y: clampedY, distance: Math.abs(x) },
			{ x: width + padded, y: clampedY, distance: Math.abs(width - x) },
			{ x: clampedX, y: -padded, distance: Math.abs(y) },
			{ x: clampedX, y: height + padded, distance: Math.abs(height - y) },
		];
		return edges.reduce((closest, edge) => (edge.distance < closest.distance ? edge : closest), edges[0]);
	}

	function randomBetween(min: number, max: number): number {
		return min + Math.random() * (max - min);
	}

	function randomRange(range: readonly [number, number]): number {
		return randomBetween(range[0], range[1]);
	}

	function randomInt(min: number, max: number): number {
		return Math.floor(randomBetween(min, max + 1));
	}

	function getNumberConfig(key: NumberConfigKey): number {
		return backgroundConfig[key];
	}

	function getRangeConfig(key: RangeConfigKey, index: 0 | 1): number {
		return backgroundConfig[key][index];
	}

	function updateNumberConfig(field: DebugNumberField, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const rawValue = Number(input.value);
		if (!Number.isFinite(rawValue)) return;

		const nextValue = field.integer ? Math.round(rawValue) : rawValue;
		backgroundConfig[field.key] = clamp(nextValue, field.min, field.max);

		if (field.key === 'minimumGridSpacing') {
			backgroundConfig.initialSpacing = Math.max(backgroundConfig.initialSpacing, backgroundConfig.minimumGridSpacing);
			backgroundConfig.spacingOptions = backgroundConfig.spacingOptions.filter(
				spacing => spacing >= backgroundConfig.minimumGridSpacing,
			);
			numberListDrafts.spacingOptions = formatNumberList(backgroundConfig.spacingOptions);
			applyCurrentSpacing(Math.max(spacingState.current, backgroundConfig.minimumGridSpacing));
		} else if (field.key === 'initialSpacing') {
			backgroundConfig.initialSpacing = Math.max(backgroundConfig.initialSpacing, backgroundConfig.minimumGridSpacing);
			applyCurrentSpacing(backgroundConfig.initialSpacing);
		} else if (field.key === 'maxPuffs') {
			puffs = puffs.slice(-backgroundConfig.maxPuffs);
		} else if (field.key === 'cellLifeTickMs' && typeof performance !== 'undefined') {
			nextCellLifeTickAt = performance.now() + backgroundConfig.cellLifeTickMs;
		} else if (field.key === 'minGlyphScale') {
			backgroundConfig.maxGlyphScale = Math.max(backgroundConfig.maxGlyphScale, backgroundConfig.minGlyphScale);
		} else if (field.key === 'maxGlyphScale') {
			backgroundConfig.minGlyphScale = Math.min(backgroundConfig.minGlyphScale, backgroundConfig.maxGlyphScale);
		}
	}

	function updateRangeConfig(field: DebugRangeField, index: 0 | 1, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const rawValue = Number(input.value);
		if (!Number.isFinite(rawValue)) return;

		const nextRange = [...backgroundConfig[field.key]] as [number, number];
		nextRange[index] = clamp(rawValue, field.min, field.max);
		if (nextRange[0] > nextRange[1]) nextRange[index === 0 ? 1 : 0] = nextRange[index];
		backgroundConfig[field.key] = nextRange;

		if (field.key === 'spacingChangeDelay') {
			rescheduleSpacingChange();
		} else if (field.key === 'directionChangeDelay') {
			rescheduleDirectionChange();
		}
	}

	function getNumberListDraft(key: NumberListConfigKey): string {
		return numberListDrafts[key];
	}

	function updateNumberListConfig(field: DebugNumberListField, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		numberListDrafts[field.key] = input.value;
		const options = uniqueNumbers(parseNumberList(input.value))
			.map(value => (field.integer ? Math.round(value) : value))
			.filter(
				value =>
					value >=
					Math.max(field.min, field.key === 'spacingOptions' ? backgroundConfig.minimumGridSpacing : field.min),
			)
			.filter(value => value <= field.max)
			.map(value => field.convertToConfig?.(value) ?? value);
		if (options.length > 0) backgroundConfig[field.key] = options;
	}

	function getGlyphListDraft(key: GlyphListConfigKey): string {
		return glyphListDrafts[key];
	}

	function updateGlyphListConfig(field: DebugGlyphListField, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		glyphListDrafts[field.key] = input.value;
		const glyphs = parseGlyphList(input.value);
		if (glyphs.length > 0) backgroundConfig[field.key] = glyphs;
	}

	function triggerSpacingChange(): void {
		if (typeof performance === 'undefined') return;
		startSpacingChange(performance.now());
	}

	function triggerDirectionChange(): void {
		if (typeof performance === 'undefined') return;
		startDirectionChange(performance.now());
	}

	function startSpacingChange(now: number): void {
		requestSpacingChange(chooseSpacing(spacingState.current), now);
	}

	function requestSpacingChange(spacing: number, now: number): void {
		const nextSpacing = Math.max(backgroundConfig.minimumGridSpacing, Math.round(spacing));
		if (Math.abs(nextSpacing - spacingState.current) < backgroundConfig.spacingChangeThreshold) {
			spacingState.nextChangeAt = now + randomRange(backgroundConfig.spacingChangeDelay);
			return;
		}
		if (!reserveStateChange(now, 'spacing')) return;

		captureOnscreenState();
		spacingState.from = spacingState.current;
		spacingState.target = nextSpacing;
		spacingState.startedAt = now;
		spacingState.duration = Math.max(1, randomRange(backgroundConfig.spacingTransitionMs));
		spacingState.active = true;
		spacingState.transitionId += 1;
	}

	function startDirectionChange(now: number): void {
		if (!reserveStateChange(now, 'direction')) return;

		directionState.angle = directionState.displayAngle;
		directionState.fromAngle = directionState.displayAngle;
		directionState.targetAngle = chooseDirection(directionState.displayAngle);
		directionState.speedFrom = directionState.speed;
		directionState.phaseStartedAt = now;

		if (directionState.speed <= 0.001) {
			directionState.speed = 0;
			directionState.phase = 'turning';
			directionState.phaseDuration = backgroundConfig.turnMs;
			return;
		}

		directionState.phase = 'decelerating';
		directionState.phaseDuration = backgroundConfig.decelerationMs;
	}

	function applyCurrentSpacing(spacing: number): void {
		if (typeof window === 'undefined') return;
		requestSpacingChange(spacing, performance.now());
	}

	function rescheduleSpacingChange(): void {
		if (typeof performance === 'undefined') return;
		spacingState.nextChangeAt = performance.now() + randomRange(backgroundConfig.spacingChangeDelay);
	}

	function rescheduleDirectionChange(): void {
		if (typeof performance === 'undefined' || directionState.phase !== 'cruise') return;
		directionState.nextChangeAt = performance.now() + randomRange(backgroundConfig.directionChangeDelay);
	}

	function reserveStateChange(now: number, kind: 'direction' | 'spacing'): boolean {
		const blockedUntil = Math.max(
			nextStateChangeAllowedAt,
			spacingState.active ? spacingState.startedAt + spacingState.duration : 0,
			directionState.phase === 'cruise' ? 0 : directionState.phaseStartedAt + directionState.phaseDuration,
		);
		if (now < blockedUntil) {
			rescheduleStateChange(kind, blockedUntil);
			return false;
		}

		nextStateChangeAllowedAt = now + backgroundConfig.stateChangeCooldownMs;
		if (kind === 'spacing') {
			directionState.nextChangeAt = Math.max(directionState.nextChangeAt, nextStateChangeAllowedAt);
		} else {
			spacingState.nextChangeAt = Math.max(spacingState.nextChangeAt, nextStateChangeAllowedAt);
		}
		return true;
	}

	function rescheduleStateChange(kind: 'direction' | 'spacing', earliestAt: number): void {
		const nextAttemptAt = earliestAt + randomRange(backgroundConfig.stateRetryDelayMs);
		if (kind === 'spacing') {
			spacingState.nextChangeAt = Math.max(spacingState.nextChangeAt, nextAttemptAt);
		} else if (directionState.phase === 'cruise') {
			directionState.nextChangeAt = Math.max(directionState.nextChangeAt, nextAttemptAt);
		}
	}

	function parseNumberList(value: string): number[] {
		return value
			.split(',')
			.map(item => Number(item.trim()))
			.filter(Number.isFinite);
	}

	function uniqueNumbers(values: number[]): number[] {
		return [...new Set(values)].sort((a, b) => a - b);
	}

	function formatNumberList(values: number[]): string {
		return values.map(formatDebugNumber).join(', ');
	}

	function parseGlyphList(value: string): string[] {
		const trimmed = value.trim();
		if (!trimmed) return [];
		if (trimmed.includes(','))
			return trimmed
				.split(',')
				.map(item => item.trim())
				.filter(Boolean);
		return Array.from(trimmed).filter(char => !/\s/.test(char));
	}

	function formatGlyphList(values: string[]): string {
		return values.join('');
	}

	function formatDebugNumber(value: number): string {
		const rounded = Math.round(value * 1000) / 1000;
		return `${rounded}`;
	}

	function degreesToRadians(value: number): number {
		return (value * Math.PI) / 180;
	}

	function radiansToDegrees(value: number): number {
		return (value * 180) / Math.PI;
	}

	function clamp(value: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value));
	}
</script>

<div
	class="letter-field"
	data-spin={directionState.phase === 'cruise' ? 'running' : 'paused'}
	aria-hidden="true"
	style={`--grid-spacing:${spacingState.current}px; --grid-angle:${directionState.displayAngle}rad;`}
>
	<div bind:this={letterGridElement} class="letter-grid">
		{#each cells as cell (cell.key)}
			{#if cell.status !== 'dead'}
				<span
					class="letter-slot"
					data-cell={cell.key}
					onpointerdown={event => popCell(cell.key, event)}
					style={`--cell-x:${cell.column * spacingState.current}px; --cell-y:${cell.row * spacingState.current}px; --o:${cell.opacity}; --s:${cell.scale}; --b:${cell.visibility}; --spawn-ms:${cell.spawnMs}ms; --decay-ms:${cell.decayMs}ms;`}
				>
					<span
						class={`drift-letter is-${cell.status} ${cell.spinClass} ${cell.spinReverse ? 'spin-reverse' : ''}`}
						style={`--spin-delay:${cell.spinDelay}ms;`}
					>
						<span class="letter-glyph">{cell.char}</span>
					</span>
				</span>
			{/if}
		{/each}

		{#each puffs as puff (puff.id)}
			<span
				class="smoke-puff"
				style={`--x:${puff.x}px; --y:${puff.y}px; --dx:${puff.dx}px; --dy:${puff.dy}px; --r:${puff.rotation}deg; --er:${puff.endRotation}deg; --o:${puff.opacity}; --s:${puff.scale}; --es:${puff.endScale}; --ttl:${puff.ttl}ms;`}
			></span>
		{/each}
	</div>
</div>

{#if debugBackgroundConfigOpen}
	<aside class="debug-config-panel" aria-label="DEBUG backgroundConfig">
		<header class="debug-config-header">
			<strong>DEBUG.backgroundConfig()</strong>
			<button type="button" aria-label="Close background config" onclick={() => DEBUG.backgroundConfig(false)}>
				Close
			</button>
		</header>

		<div class="debug-config-actions">
			<button type="button" onclick={triggerDirectionChange}>Change Direction</button>
			<button type="button" onclick={triggerSpacingChange}>Change Spacing</button>
		</div>

		<div class="debug-config-section">
			{#each numberConfigFields as field}
				<label class="debug-config-row">
					<span>{field.label}</span>
					<input
						type="range"
						min={field.min}
						max={field.max}
						step={field.step}
						value={getNumberConfig(field.key)}
						oninput={event => updateNumberConfig(field, event)}
					/>
					<input
						type="number"
						min={field.min}
						max={field.max}
						step={field.step}
						value={getNumberConfig(field.key)}
						oninput={event => updateNumberConfig(field, event)}
					/>
				</label>
			{/each}
		</div>

		<div class="debug-config-section">
			{#each rangeConfigFields as field}
				<div class="debug-config-range">
					<span>{field.label}</span>
					<label>
						<em>min</em>
						<input
							type="range"
							min={field.min}
							max={field.max}
							step={field.step}
							value={getRangeConfig(field.key, 0)}
							oninput={event => updateRangeConfig(field, 0, event)}
						/>
						<input
							type="number"
							min={field.min}
							max={field.max}
							step={field.step}
							value={getRangeConfig(field.key, 0)}
							oninput={event => updateRangeConfig(field, 0, event)}
						/>
					</label>
					<label>
						<em>max</em>
						<input
							type="range"
							min={field.min}
							max={field.max}
							step={field.step}
							value={getRangeConfig(field.key, 1)}
							oninput={event => updateRangeConfig(field, 1, event)}
						/>
						<input
							type="number"
							min={field.min}
							max={field.max}
							step={field.step}
							value={getRangeConfig(field.key, 1)}
							oninput={event => updateRangeConfig(field, 1, event)}
						/>
					</label>
				</div>
			{/each}
		</div>

		{#each numberListConfigFields as field}
			<label class="debug-config-list">
				<span>{field.label}</span>
				<input
					type="text"
					value={getNumberListDraft(field.key)}
					oninput={event => updateNumberListConfig(field, event)}
				/>
			</label>
		{/each}

		{#each glyphListConfigFields as field}
			<label class="debug-config-list">
				<span>{field.label}</span>
				<input
					type="text"
					value={getGlyphListDraft(field.key)}
					oninput={event => updateGlyphListConfig(field, event)}
				/>
			</label>
		{/each}
	</aside>
{/if}

<style>
	.letter-field {
		--grid-angle: 0rad;
		--grid-spacing: 64px;
		position: fixed;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		pointer-events: none;
	}

	.letter-grid {
		position: absolute;
		inset: 0;
		pointer-events: none;
		transform: translate3d(0, 0, 0);
		transform-origin: 0 0;
		will-change: transform;
		contain: layout style;
	}

	.letter-slot {
		position: absolute;
		left: 0;
		top: 0;
		z-index: 1;
		display: grid;
		width: var(--grid-spacing);
		height: var(--grid-spacing);
		place-items: center;
		pointer-events: auto;
		transform: translate3d(var(--cell-x), var(--cell-y), 0);
		user-select: none;
	}

	.drift-letter {
		display: grid;
		width: 100%;
		height: 100%;
		place-items: center;
		border: 0;
		background: transparent;
		color: var(--app-muted);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 1.15rem;
		font-weight: 800;
		line-height: 1;
		opacity: calc(var(--o) * var(--b));
		padding: 0;
		text-shadow: 0 0 1rem color-mix(in oklab, var(--app-accent) 40%, transparent);
		transform: rotate(var(--grid-angle)) scale(calc(var(--s) * (0.58 + var(--b) * 0.42)));
		transform-origin: center;
		transition:
			opacity 160ms linear,
			transform 220ms ease;
	}

	.letter-glyph {
		display: inline-block;
		animation: letter-spin 24s linear infinite;
		animation-delay: var(--spin-delay);
		transform-origin: center;
	}

	.letter-field[data-spin='paused'] .letter-glyph {
		animation-play-state: paused;
	}

	.spin-reverse .letter-glyph {
		animation-direction: reverse;
	}

	.spin-0 .letter-glyph {
		animation-duration: 18s;
	}

	.spin-1 .letter-glyph {
		animation-duration: 22s;
	}

	.spin-2 .letter-glyph {
		animation-duration: 26s;
	}

	.spin-3 .letter-glyph {
		animation-duration: 31s;
	}

	.spin-4 .letter-glyph {
		animation-duration: 37s;
	}

	.spin-5 .letter-glyph {
		animation-duration: 44s;
	}

	.drift-letter.is-spawning {
		animation: letter-spawn var(--spawn-ms) ease-out both;
	}

	.drift-letter.is-dying {
		pointer-events: none;
		animation: letter-decay var(--decay-ms) ease-out forwards;
	}

	.letter-slot:hover .drift-letter {
		color: var(--app-accent-strong);
		text-shadow:
			0 0 0.75rem color-mix(in oklab, var(--app-accent) 52%, transparent),
			0 0 1.6rem color-mix(in oklab, var(--app-accent) 24%, transparent);
	}

	.smoke-puff {
		position: absolute;
		left: 0;
		top: 0;
		z-index: 2;
		width: 2.1rem;
		aspect-ratio: 1;
		border-radius: 999px;
		background:
			radial-gradient(circle, color-mix(in oklab, var(--app-accent-strong) 52%, transparent) 0 18%, transparent 64%),
			radial-gradient(circle, color-mix(in oklab, var(--app-muted) 42%, transparent) 0 42%, transparent 72%);
		filter: blur(0.38rem);
		opacity: 0;
		pointer-events: none;
		transform: translate3d(var(--x), var(--y), 0) translate(-50%, -50%) rotate(var(--r)) scale(var(--s));
		animation: smoke-puff var(--ttl) ease-out forwards;
		will-change: transform, opacity;
	}

	@keyframes letter-spin {
		to {
			transform: rotate(1turn);
		}
	}

	@keyframes letter-spawn {
		0% {
			opacity: 0;
			transform: rotate(var(--grid-angle)) scale(calc(var(--s) * 0.28));
		}

		72% {
			opacity: calc(var(--o) * 0.86);
		}

		100% {
			opacity: calc(var(--o) * var(--b));
			transform: rotate(var(--grid-angle)) scale(calc(var(--s) * (0.58 + var(--b) * 0.42)));
		}
	}

	@keyframes letter-decay {
		to {
			opacity: 0;
			transform: rotate(var(--grid-angle)) scale(calc(var(--s) * 0.24));
		}
	}

	@keyframes smoke-puff {
		0% {
			opacity: 0;
			transform: translate3d(var(--x), var(--y), 0) translate(-50%, -50%) rotate(var(--r)) scale(calc(var(--s) * 0.65));
		}

		18% {
			opacity: var(--o);
		}

		100% {
			opacity: 0;
			transform: translate3d(calc(var(--x) + var(--dx)), calc(var(--y) + var(--dy)), 0) translate(-50%, -50%)
				rotate(calc(var(--r) + var(--er))) scale(var(--es));
		}
	}

	.debug-config-panel {
		position: fixed;
		top: 0.75rem;
		right: 0.75rem;
		z-index: 4;
		display: grid;
		gap: 0.55rem;
		width: min(28rem, calc(100vw - 1.5rem));
		max-height: calc(100dvh - 1.5rem);
		border: 1px solid color-mix(in oklab, var(--app-border) 76%, transparent);
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--app-panel) 92%, transparent);
		box-shadow: 0 1rem 3rem color-mix(in oklab, black 44%, transparent);
		color: var(--app-panel-text);
		font-size: 0.72rem;
		padding: 0.7rem;
		overflow: auto;
		pointer-events: auto;
		backdrop-filter: blur(1rem);
	}

	.debug-config-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		color: var(--app-text);
		font-family: var(--font-mono);
		font-size: 0.76rem;
	}

	.debug-config-header button {
		border: 1px solid color-mix(in oklab, var(--app-border) 82%, transparent);
		border-radius: 0.375rem;
		background: var(--app-input);
		color: var(--app-text);
		cursor: pointer;
		font: inherit;
		padding: 0.2rem 0.45rem;
	}

	.debug-config-section {
		display: grid;
		gap: 0.45rem;
	}

	.debug-config-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.debug-config-actions button {
		min-height: 2rem;
		border: 1px solid color-mix(in oklab, var(--app-border) 82%, transparent);
		border-radius: 0.375rem;
		background: color-mix(in oklab, var(--app-accent) 18%, var(--app-input));
		color: var(--app-text);
		cursor: pointer;
		font: inherit;
		font-weight: 800;
	}

	.debug-config-actions button:hover {
		background: color-mix(in oklab, var(--app-accent) 30%, var(--app-input));
	}

	.debug-config-row,
	.debug-config-range label,
	.debug-config-list {
		display: grid;
		grid-template-columns: 8.6rem minmax(6rem, 1fr) 4.8rem;
		align-items: center;
		gap: 0.45rem;
	}

	.debug-config-range {
		display: grid;
		gap: 0.25rem;
		border-top: 1px solid color-mix(in oklab, var(--app-border) 64%, transparent);
		padding-top: 0.45rem;
	}

	.debug-config-range > span,
	.debug-config-row > span,
	.debug-config-list > span {
		color: var(--app-muted);
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}

	.debug-config-range em {
		color: var(--app-muted);
		font-style: normal;
		font-weight: 800;
		text-transform: uppercase;
	}

	.debug-config-panel input {
		min-width: 0;
		accent-color: var(--app-accent);
	}

	.debug-config-panel input[type='number'],
	.debug-config-panel input[type='text'] {
		width: 100%;
		border: 1px solid var(--app-border);
		border-radius: 0.375rem;
		background: var(--app-input);
		color: var(--app-text);
		font: inherit;
		padding: 0.25rem 0.35rem;
	}

	.debug-config-list {
		grid-template-columns: 8.6rem minmax(0, 1fr);
	}

	@media (max-width: 420px) {
		.debug-config-panel {
			top: 0.4rem;
			right: 0.4rem;
			width: calc(100vw - 0.8rem);
			max-height: 48dvh;
		}

		.debug-config-row,
		.debug-config-range label,
		.debug-config-list {
			grid-template-columns: 1fr;
		}
	}
</style>
