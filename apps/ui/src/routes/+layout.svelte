<script lang="ts">
	import InkButton from '$lib/InkButton.svelte';
	import PhantomLogo from '$lib/PhantomLogo.svelte';
	import { getStored, setStored, storageKeys } from '$lib/storage';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { onMount } from 'svelte';
	import { cubicIn, cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	import './layout.css';

	let { children } = $props();
	const browser = typeof window !== 'undefined';
	type Theme = 'dark' | 'light';
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
		targetAliveRatio: number;
		initialSpacing: number;
		spacingOptions: number[];
		spacingChangeDelay: [number, number];
		spacingTransitionMs: [number, number];
		directionOptions: number[];
		directionChangeDelay: [number, number];
		targetSpeed: number;
		decelerationMs: number;
		turnMs: number;
		accelerationMs: number;
		maxPuffs: number;
	};
	type DebugState = {
		backgroundConfig: boolean;
	};
	type NumberConfigKey =
		| 'targetAliveRatio'
		| 'initialSpacing'
		| 'targetSpeed'
		| 'decelerationMs'
		| 'turnMs'
		| 'accelerationMs'
		| 'maxPuffs';
	type RangeConfigKey = 'spacingChangeDelay' | 'spacingTransitionMs' | 'directionChangeDelay';
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

	const navItems = [
		{ href: '/', label: 'Lobby' },
		{ href: '/pad', label: 'Pad' },
		{ href: '/whispers', label: 'Whispers' },
	];
	const glyphs = 'PHANTOMINKSILENCIOSEANCEGHOSTWRITERMOONSUNOBJECTCLUE'.split('');
	const rareGlyphs = ['☺', '☻', '☹'];
	const rareGlyphChance = 0.02;
	const minGlyphScale = 0.58;
	const maxGlyphScale = 1.72;
	const naturalDecayMs: [number, number] = [120, 220];
	const minimumGridSpacing = 54;
	const gridPaddingCells = 4;
	const cellLifeTickMs = 90;
	const stateChangeCooldownMs = 10000;
	const defaultDirectionOptions = Array.from({ length: 24 }, (_, index) => degreesToRadians(index * 15));
	const spinClasses = ['spin-0', 'spin-1', 'spin-2', 'spin-3', 'spin-4', 'spin-5'] as const;
	const numberConfigFields = [
		{ key: 'targetAliveRatio', label: 'targetAliveRatio', min: 0.05, max: 0.95, step: 0.01 },
		{ key: 'initialSpacing', label: 'initialSpacing', min: minimumGridSpacing, max: 128, step: 1, integer: true },
		{ key: 'targetSpeed', label: 'targetSpeed', min: 0, max: 0.08, step: 0.001 },
		{ key: 'decelerationMs', label: 'decelerationMs', min: 200, max: 9000, step: 100, integer: true },
		{ key: 'turnMs', label: 'turnMs', min: 200, max: 9000, step: 100, integer: true },
		{ key: 'accelerationMs', label: 'accelerationMs', min: 200, max: 9000, step: 100, integer: true },
		{ key: 'maxPuffs', label: 'maxPuffs', min: 12, max: 240, step: 1, integer: true },
	] satisfies readonly DebugNumberField[];
	const rangeConfigFields = [
		{ key: 'spacingChangeDelay', label: 'spacingChangeDelay', min: 1000, max: 150000, step: 1000 },
		{ key: 'spacingTransitionMs', label: 'spacingTransitionMs', min: 500, max: 18000, step: 100 },
		{ key: 'directionChangeDelay', label: 'directionChangeDelay', min: 1000, max: 180000, step: 1000 },
	] satisfies readonly DebugRangeField[];
	const DEBUG = $state<DebugState>({
		backgroundConfig: true,
	});
	const backgroundConfig = $state<BackgroundConfig>({
		targetAliveRatio: 0.7,
		initialSpacing: 64,
		spacingOptions: [54, 64, 76, 88],
		spacingChangeDelay: [42000, 72000],
		spacingTransitionMs: [4200, 7200],
		directionOptions: defaultDirectionOptions,
		directionChangeDelay: [48000, 90000],
		targetSpeed: 0.024,
		decelerationMs: 1800,
		turnMs: 1500,
		accelerationMs: 2200,
		maxPuffs: 96,
	});

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser,
			},
		},
	});

	let theme = $state<Theme>(getStored(storageKeys.darkMode) ? 'dark' : 'light');
	let cells = $state<GridCell[]>([]);
	let puffs = $state<SmokePuff[]>([]);
	let activePath = $state(typeof location === 'undefined' ? '/' : location.pathname);
	let letterGridElement: HTMLDivElement | undefined = undefined;
	let smokeId = 0;
	let gridShiftX = 0;
	let gridShiftY = 0;
	let gridColumns = $state(0);
	let gridRows = $state(0);
	let nextStateChangeAllowedAt = 0;
	let nextCellLifeTickAt = 0;
	let directionState = $state<DirectionState>(createDirectionState(0));
	let spacingState = $state<SpacingState>(createSpacingState(0));
	let spacingOptionsDraft = $state(formatNumberList(backgroundConfig.spacingOptions));
	let directionOptionsDraft = $state(formatNumberList(backgroundConfig.directionOptions.map(radiansToDegrees)));

	if (browser) Object.assign(globalThis, { DEBUG });

	$effect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.dataset.theme = theme;
		setStored(storageKeys.darkMode, theme === 'dark');
	});

	onMount(() => {
		const now = performance.now();
		directionState = createDirectionState(now);
		spacingState = createSpacingState(now);
		ensureGridCells(window.innerWidth, window.innerHeight, true);
		captureOnscreenState();
		applyGridStyle();
		nextCellLifeTickAt = now + cellLifeTickMs;

		let frame = 0;
		let lastTime = now;

		const tick = (now: number) => {
			const elapsedMs = Math.max(0, Math.min(1000, now - lastTime));
			lastTime = now;

			updateSpacing(now);
			updateDirection(now);
			updateGridMotion(elapsedMs);
			ensureGridCells(window.innerWidth, window.innerHeight, false);
			checkSpacingExpansionEdges();
			updateCellLife(now);
			applyGridStyle();
			frame = window.requestAnimationFrame(tick);
		};

		frame = window.requestAnimationFrame(tick);
		const updatePath = () => (activePath = window.location.pathname);
		const pushState = history.pushState;
		const replaceState = history.replaceState;

		history.pushState = function pushStateAndUpdate(...args) {
			pushState.apply(this, args);
			updatePath();
		};
		history.replaceState = function replaceStateAndUpdate(...args) {
			replaceState.apply(this, args);
			updatePath();
		};
		window.addEventListener('popstate', updatePath);

		return () => {
			window.cancelAnimationFrame(frame);
			history.pushState = pushState;
			history.replaceState = replaceState;
			window.removeEventListener('popstate', updatePath);
		};
	});

	function ensureGridCells(width: number, height: number, seedAlive: boolean): void {
		const metrics = getGridMetrics(width, height);
		if (metrics.columns === gridColumns && metrics.rows === gridRows && cells.length > 0) return;

		const existing = new Map(cells.map(cell => [cell.key, cell]));
		const nextCells: GridCell[] = [];
		gridColumns = metrics.columns;
		gridRows = metrics.rows;
		for (let row = 0; row < metrics.rows; row += 1) {
			for (let column = 0; column < metrics.columns; column += 1) {
				const key = `${column}:${row}`;
				nextCells.push(
					existing.get(key) ??
						createGridCell(column, row, seedAlive && Math.random() < backgroundConfig.targetAliveRatio),
				);
			}
		}
		cells = nextCells;
	}

	function createGridCell(column: number, row: number, seedAlive: boolean): GridCell {
		const char = chooseGlyph();
		return {
			key: `${column}:${row}`,
			char,
			column,
			row,
			opacity: randomBetween(0.16, 0.46),
			scale: glyphScale(char),
			spinClass: spinClasses[Math.floor(Math.random() * spinClasses.length)],
			spinReverse: Math.random() < 0.5,
			spinDelay: randomBetween(-20000, 0),
			visibility: seedAlive ? 1 : 0,
			status: seedAlive ? 'alive' : 'dead',
			spawnMs: randomBetween(900, 1900),
			decayMs: randomRange(naturalDecayMs),
			spawnDoneAt: 0,
			deathAt: 0,
			wasOnscreen: false,
			edgePuffTransition: 0,
		};
	}

	function updateCellLife(now: number): void {
		if (now < nextCellLifeTickAt) return;
		nextCellLifeTickAt = now + cellLifeTickMs;
		puffs = puffs.filter(puff => now < puff.removeAt);

		const total = Math.max(1, cells.length);
		const living = cells.filter(cell => cell.status === 'alive' || cell.status === 'spawning').length;
		const occupancy = living / total;
		const tickSeconds = cellLifeTickMs / 1000;
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
				if (Math.random() < (0.04 + spawnPressure * 1.4) * tickSeconds) spawnCell(cell);
			} else if (Math.random() < (0.012 + decayPressure * 0.52) * tickSeconds) {
				fadeCell(cell);
			}
		}
	}

	function spawnCell(cell: GridCell): void {
		cell.char = chooseGlyph();
		cell.opacity = randomBetween(0.16, 0.46);
		cell.scale = glyphScale(cell.char);
		cell.spinClass = spinClasses[Math.floor(Math.random() * spinClasses.length)];
		cell.spinReverse = Math.random() < 0.5;
		cell.spinDelay = randomBetween(-20000, 0);
		cell.spawnMs = randomBetween(900, 1900);
		cell.decayMs = randomRange(naturalDecayMs);
		cell.spawnDoneAt = performance.now() + cell.spawnMs;
		cell.deathAt = 0;
		cell.visibility = 1;
		cell.status = 'spawning';
	}

	function fadeCell(cell: GridCell): void {
		if (cell.status !== 'alive') return;

		cell.visibility = 0;
		cell.decayMs = randomRange(naturalDecayMs);
		cell.deathAt = performance.now() + cell.decayMs;
		cell.status = 'dying';
		const point = cellCenter(cell);
		spawnSmoke(point.x, point.y, 6, 0.48, 0.7);
	}

	function popCell(key: string, event: PointerEvent): void {
		event.preventDefault();
		event.stopPropagation();
		const cell = cells.find(item => item.key === key);
		if (!cell || cell.status === 'dead') return;

		const point = cellCenter(cell);
		spawnSmoke(point.x, point.y, 18, 1.35, 0.46);
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
		wrapGridShift();
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
		if (directionState.phase !== 'turning') {
			gridShiftX += Math.cos(directionState.angle) * directionState.speed * elapsedMs;
			gridShiftY += Math.sin(directionState.angle) * directionState.speed * elapsedMs;
			wrapGridShift();
		}
	}

	function applyGridStyle(): void {
		if (!letterGridElement) return;
		letterGridElement.style.width = `${gridColumns * spacingState.current}px`;
		letterGridElement.style.height = `${gridRows * spacingState.current}px`;
		letterGridElement.style.gridTemplateColumns = `repeat(${gridColumns}, var(--grid-spacing))`;
		letterGridElement.style.gridTemplateRows = `repeat(${gridRows}, var(--grid-spacing))`;
		letterGridElement.style.transform = `translate3d(${gridOffsetX()}px, ${gridOffsetY()}px, 0)`;
	}

	function wrapGridShift(): void {
		const spacing = spacingState.current;
		let columnShift = 0;
		let rowShift = 0;

		while (gridShiftX >= spacing) {
			gridShiftX -= spacing;
			columnShift += 1;
		}
		while (gridShiftX < 0) {
			gridShiftX += spacing;
			columnShift -= 1;
		}
		while (gridShiftY >= spacing) {
			gridShiftY -= spacing;
			rowShift += 1;
		}
		while (gridShiftY < 0) {
			gridShiftY += spacing;
			rowShift -= 1;
		}

		if (columnShift || rowShift) {
			shiftCells(columnShift, rowShift);
			shiftPuffs(columnShift * spacing, rowShift * spacing);
		}
	}

	function shiftCells(columnShift: number, rowShift: number): void {
		if (!cells.length || gridColumns <= 0 || gridRows <= 0) return;

		const previous = new Map(cells.map(cell => [cell.key, cell]));
		cells = cells.map(slot => {
			const sourceColumn = wrapIndex(slot.column - columnShift, gridColumns);
			const sourceRow = wrapIndex(slot.row - rowShift, gridRows);
			const source = previous.get(`${sourceColumn}:${sourceRow}`) ?? slot;
			return {
				...slot,
				char: source.char,
				opacity: source.opacity,
				scale: source.scale,
				spinClass: source.spinClass,
				spinReverse: source.spinReverse,
				spinDelay: source.spinDelay,
				visibility: source.visibility,
				status: source.status,
				spawnMs: source.spawnMs,
				decayMs: source.decayMs,
				spawnDoneAt: source.spawnDoneAt,
				deathAt: source.deathAt,
				wasOnscreen: source.wasOnscreen,
				edgePuffTransition: source.edgePuffTransition,
			};
		});
	}

	function shiftPuffs(dx: number, dy: number): void {
		if (puffs.length === 0) return;
		puffs = puffs.map(puff => ({
			...puff,
			x: puff.x + dx,
			y: puff.y + dy,
		}));
	}

	function spawnSmoke(x: number, y: number, count: number, intensity: number, ttlScale: number): void {
		const now = performance.now();
		const nextPuffs = Array.from({ length: count }, () => {
			const angle = Math.random() * Math.PI * 2;
			const distance = randomBetween(9, 28) * intensity;
			const scale = randomBetween(0.42, 1.1) * intensity;
			const ttl = randomBetween(760, 1500) * ttlScale;
			return {
				id: (smokeId += 1),
				x,
				y,
				dx: Math.cos(angle) * distance,
				dy: Math.sin(angle) * distance,
				rotation: Math.random() * 360,
				endRotation: randomBetween(-24, 24),
				opacity: randomBetween(0.16, 0.5) * intensity,
				scale,
				endScale: scale + randomBetween(0.34, 0.78) * intensity,
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
		const initialSpacing = Math.max(minimumGridSpacing, backgroundConfig.initialSpacing);
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
		if (Math.random() < rareGlyphChance) return rareGlyphs[Math.floor(Math.random() * rareGlyphs.length)];
		return glyphs[Math.floor(Math.random() * glyphs.length)];
	}

	function glyphScale(char: string): number {
		return rareGlyphs.includes(char) ? maxGlyphScale : randomBetween(minGlyphScale, maxGlyphScale);
	}

	function chooseSpacing(current: number): number {
		const options = backgroundConfig.spacingOptions.filter(spacing => Math.abs(spacing - current) > 1);
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

	function wrapIndex(value: number, max: number): number {
		return ((value % max) + max) % max;
	}

	function getGridMetrics(width: number, height: number): { columns: number; rows: number } {
		const columns = Math.max(gridColumns, Math.ceil(width / minimumGridSpacing) + gridPaddingCells * 2);
		const rows = Math.max(gridRows, Math.ceil(height / minimumGridSpacing) + gridPaddingCells * 2);
		return {
			columns,
			rows,
		};
	}

	function gridOffsetX(): number {
		return -spacingState.current * gridPaddingCells + gridShiftX;
	}

	function gridOffsetY(): number {
		return -spacingState.current * gridPaddingCells + gridShiftY;
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
			x: gridOffsetX() + point.x,
			y: gridOffsetY() + point.y,
		};
	}

	function screenToGrid(x: number, y: number): { x: number; y: number } {
		return {
			x: x - gridOffsetX(),
			y: y - gridOffsetY(),
		};
	}

	function isNearViewportPoint(x: number, y: number, width: number, height: number, spacing: number): boolean {
		const margin = spacing * 0.7;
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
				spawnSmoke(gridPoint.x, gridPoint.y, 4, 0.34, 0.78);
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
		const padded = spacing * 1.25;
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

		if (field.key === 'initialSpacing') {
			applyCurrentSpacing(backgroundConfig.initialSpacing);
		} else if (field.key === 'maxPuffs') {
			puffs = puffs.slice(-backgroundConfig.maxPuffs);
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

	function updateSpacingOptions(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		spacingOptionsDraft = input.value;
		const options = uniqueNumbers(parseNumberList(spacingOptionsDraft))
			.map(value => Math.round(value))
			.filter(value => value >= minimumGridSpacing && value <= 180);
		if (options.length > 0) backgroundConfig.spacingOptions = options;
	}

	function updateDirectionOptions(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		directionOptionsDraft = input.value;
		const options = parseNumberList(directionOptionsDraft).map(degreesToRadians);
		if (options.length > 0) backgroundConfig.directionOptions = options;
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
		const nextSpacing = Math.max(minimumGridSpacing, Math.round(spacing));
		if (Math.abs(nextSpacing - spacingState.current) < 1) {
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

		nextStateChangeAllowedAt = now + stateChangeCooldownMs;
		if (kind === 'spacing') {
			directionState.nextChangeAt = Math.max(directionState.nextChangeAt, nextStateChangeAllowedAt);
		} else {
			spacingState.nextChangeAt = Math.max(spacingState.nextChangeAt, nextStateChangeAllowedAt);
		}
		return true;
	}

	function rescheduleStateChange(kind: 'direction' | 'spacing', earliestAt: number): void {
		const nextAttemptAt = earliestAt + randomBetween(800, 1800);
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

	function isActive(href: string): boolean {
		return href === '/' ? activePath === '/' : activePath.startsWith(href);
	}
</script>

<QueryClientProvider client={queryClient}>
	<div class="app-scene">
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
							class={`drift-letter is-${cell.status} ${cell.spinClass} ${cell.spinReverse ? 'spin-reverse' : ''}`}
							data-cell={cell.key}
							onpointerdown={event => popCell(cell.key, event)}
							style={`grid-column:${cell.column + 1}; grid-row:${cell.row + 1}; --o:${cell.opacity}; --s:${cell.scale}; --b:${cell.visibility}; --spawn-ms:${cell.spawnMs}ms; --decay-ms:${cell.decayMs}ms; --spin-delay:${cell.spinDelay}ms;`}
						>
							<span class="letter-glyph">{cell.char}</span>
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

		<section class="content-card">
			<header class="app-header">
				<a class="logo-link" href="/" aria-label="Phantom Ink lobby">
					<PhantomLogo compact />
				</a>
				<InkButton size="sm" onclick={() => (theme = theme === 'dark' ? 'light' : 'dark')}>
					{theme === 'dark' ? 'Light' : 'Dark'}
				</InkButton>
			</header>

			<nav class="screen-nav" aria-label="Mock screens">
				{#each navItems as item}
					<a href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
						{item.label}
					</a>
				{/each}
			</nav>

			{#key activePath}
				<div
					class="route-frame"
					in:fly={{ y: 18, duration: 340, easing: cubicOut }}
					out:fade={{ duration: 130, easing: cubicIn }}
				>
					{@render children()}
				</div>
			{/key}
		</section>

		{#if DEBUG.backgroundConfig}
			<aside class="debug-config-panel" aria-label="DEBUG backgroundConfig">
				<header class="debug-config-header">
					<strong>DEBUG.backgroundConfig</strong>
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

				<label class="debug-config-list">
					<span>spacingOptions</span>
					<input type="text" value={spacingOptionsDraft} oninput={updateSpacingOptions} />
				</label>
				<label class="debug-config-list">
					<span>directionOptionsDeg</span>
					<input type="text" value={directionOptionsDraft} oninput={updateDirectionOptions} />
				</label>
			</aside>
		{/if}
	</div>
</QueryClientProvider>
