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
		x: number;
		y: number;
		rotation: number;
		opacity: number;
		scale: number;
		spinPhase: number;
		spinSpeed: number;
		visibility: number;
		status: CellStatus;
		spawnMs: number;
		decayMs: number;
		wasOnscreen: boolean;
		edgePuffTransition: number;
	};
	type SmokePuff = {
		id: number;
		x: number;
		y: number;
		vx: number;
		vy: number;
		rotation: number;
		spin: number;
		opacity: number;
		baseOpacity: number;
		scale: number;
		growth: number;
		age: number;
		ttl: number;
		flowFollow: number;
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
	const naturalDecayVisibility = 0.18;
	const naturalDecayMs: [number, number] = [120, 220];
	const minimumGridSpacing = 54;
	const stateChangeCooldownMs = 10000;
	const defaultDirectionOptions = Array.from({ length: 24 }, (_, index) => degreesToRadians(index * 15));
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
	let smokeId = 0;
	let flowPhaseX = 0;
	let flowPhaseY = 0;
	let gridColumns = 0;
	let gridRows = 0;
	let nextStateChangeAllowedAt = 0;
	let directionState: DirectionState = createDirectionState(0);
	let spacingState: SpacingState = createSpacingState(0);
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
		syncGridCells(window.innerWidth, window.innerHeight, true);

		let frame = 0;
		let lastTime = now;

		const tick = (now: number) => {
			const elapsedMs = Math.max(0, Math.min(1000, now - lastTime));
			lastTime = now;

			updateSpacing(now);
			updateDirection(now, elapsedMs, window.innerWidth, window.innerHeight);
			syncGridCells(window.innerWidth, window.innerHeight, false);
			updateCells(elapsedMs);
			updatePuffs(elapsedMs);
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

	function syncGridCells(width: number, height: number, seedAlive: boolean): void {
		const spacing = spacingState.current;
		const existing = new Map(cells.map(cell => [cell.key, cell]));
		const nextCells: GridCell[] = [];
		const metrics = getGridMetrics(width, height, spacing);
		const spacingIsExpanding = spacingState.active && spacingState.target > spacingState.from;

		for (let row = 0; row < metrics.rows; row += 1) {
			for (let column = 0; column < metrics.columns; column += 1) {
				const key = `${column}:${row}`;
				const existingCell = existing.get(key);
				const cell =
					existingCell ?? createGridCell(key, seedAlive && Math.random() < backgroundConfig.targetAliveRatio);
				const wasOnscreen = cell.wasOnscreen;
				cell.x = gridX(column, metrics);
				cell.y = gridY(row, metrics);
				const isOnscreen = isNearViewport(cell.x, cell.y, width, height, metrics.spacing);
				if (
					spacingIsExpanding &&
					wasOnscreen &&
					!isOnscreen &&
					cell.edgePuffTransition !== spacingState.transitionId &&
					cell.status !== 'dead' &&
					cell.visibility > 0
				) {
					const edge = outsidePointNear(cell.x, cell.y, width, height, metrics.spacing);
					spawnSmoke(Math.min(width, Math.max(0, edge.x)), Math.min(height, Math.max(0, edge.y)), 4, 0.3, 0.76, 1);
					cell.visibility = 0;
					cell.status = 'dead';
					cell.edgePuffTransition = spacingState.transitionId;
				}
				cell.wasOnscreen = isOnscreen;
				cell.rotation = directionState.displayAngle + cell.spinPhase * spinWeight();
				nextCells.push(cell);
			}
		}

		cells = nextCells;
	}

	function createGridCell(key: string, seedAlive: boolean): GridCell {
		const char = chooseGlyph();
		return {
			key,
			char,
			x: 0,
			y: 0,
			rotation: 0,
			opacity: randomBetween(0.16, 0.46),
			scale: glyphScale(char),
			spinPhase: randomBetween(0, Math.PI * 2),
			spinSpeed: randomSigned(0.00022, 0.0009),
			visibility: seedAlive ? 1 : 0,
			status: seedAlive ? 'alive' : 'dead',
			spawnMs: randomBetween(900, 1900),
			decayMs: randomRange(naturalDecayMs),
			wasOnscreen: false,
			edgePuffTransition: 0,
		};
	}

	function updateCells(elapsedMs: number): void {
		const total = Math.max(1, cells.length);
		const living = cells.filter(cell => cell.status === 'alive' || cell.status === 'spawning').length;
		const occupancy = living / total;
		const spawnPressure = Math.max(
			0,
			(backgroundConfig.targetAliveRatio - occupancy) / backgroundConfig.targetAliveRatio,
		);
		const decayPressure = Math.max(
			0,
			(occupancy - backgroundConfig.targetAliveRatio) / (1 - backgroundConfig.targetAliveRatio),
		);

		for (const cell of cells) {
			if (cell.status === 'alive' && directionState.phase === 'cruise') {
				cell.spinPhase += cell.spinSpeed * elapsedMs;
			}

			if (cell.status === 'spawning') {
				cell.visibility = Math.min(1, cell.visibility + elapsedMs / cell.spawnMs);
				if (cell.visibility >= 1) cell.status = 'alive';
			} else if (cell.status === 'dying') {
				cell.visibility = Math.max(0, cell.visibility - elapsedMs / cell.decayMs);
				if (cell.visibility <= 0) cell.status = 'dead';
			} else if (cell.status === 'dead') {
				if (Math.random() < (0.04 + spawnPressure * 1.4) * (elapsedMs / 1000)) spawnCell(cell);
			} else if (Math.random() < (0.012 + decayPressure * 0.52) * (elapsedMs / 1000)) {
				fadeCell(cell);
			}

			cell.rotation = directionState.displayAngle + cell.spinPhase * spinWeight();
		}
	}

	function spawnCell(cell: GridCell): void {
		cell.char = chooseGlyph();
		cell.opacity = randomBetween(0.16, 0.46);
		cell.scale = glyphScale(cell.char);
		cell.spinPhase = 0;
		cell.spinSpeed = randomSigned(0.00022, 0.0009);
		cell.spawnMs = randomBetween(900, 1900);
		cell.visibility = 0;
		cell.status = 'spawning';
	}

	function fadeCell(cell: GridCell): void {
		if (cell.status !== 'alive') return;

		cell.visibility = Math.min(cell.visibility, naturalDecayVisibility);
		cell.decayMs = randomRange(naturalDecayMs);
		cell.status = 'dying';
		spawnSmoke(cell.x, cell.y, 6, 0.48, 0.7, 1);
	}

	function popCell(key: string, event: PointerEvent): void {
		event.preventDefault();
		event.stopPropagation();
		const cell = cells.find(item => item.key === key);
		if (!cell || cell.status === 'dead') return;

		spawnSmoke(cell.x, cell.y, 18, 1.35, 0.46, 1);
		cell.visibility = 0;
		cell.status = 'dead';
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

	function updateDirection(now: number, elapsedMs: number, width: number, height: number): void {
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

		if (directionState.phase !== 'turning') {
			const metrics = getGridMetrics(width, height, spacingState.current);
			flowPhaseX = wrapUnit(
				flowPhaseX + (Math.cos(directionState.angle) * directionState.speed * elapsedMs) / metrics.spanX,
			);
			flowPhaseY = wrapUnit(
				flowPhaseY + (Math.sin(directionState.angle) * directionState.speed * elapsedMs) / metrics.spanY,
			);
		}
	}

	function spawnSmoke(x: number, y: number, count: number, intensity: number, ttlScale: number, flowFollow = 1): void {
		const nextPuffs = Array.from({ length: count }, () => {
			const angle = Math.random() * Math.PI * 2;
			const speed = randomBetween(0.22, 0.78) * intensity;
			return {
				id: (smokeId += 1),
				x,
				y,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed,
				rotation: Math.random() * 360,
				spin: randomBetween(-0.28, 0.28),
				opacity: 0,
				baseOpacity: randomBetween(0.16, 0.5) * intensity,
				scale: randomBetween(0.42, 1.1) * intensity,
				growth: randomBetween(0.008, 0.024) * intensity,
				age: 0,
				ttl: randomBetween(760, 1500) * ttlScale,
				flowFollow: flowFollow * randomBetween(0.72, 1.18),
			};
		});
		puffs = [...puffs, ...nextPuffs].slice(-backgroundConfig.maxPuffs);
	}

	function updatePuffs(elapsedMs: number): void {
		const dt = elapsedMs / 16.67;
		const flowX = Math.cos(directionState.angle) * directionState.speed * elapsedMs;
		const flowY = Math.sin(directionState.angle) * directionState.speed * elapsedMs;
		for (const puff of puffs) {
			puff.age += elapsedMs;
			const progress = Math.min(1, puff.age / puff.ttl);
			puff.x += puff.vx * dt + flowX * puff.flowFollow;
			puff.y += puff.vy * dt + flowY * puff.flowFollow;
			puff.rotation += puff.spin * dt;
			puff.scale += puff.growth * dt;
			puff.opacity = puff.baseOpacity * Math.sin(progress * Math.PI) * (1 - progress * 0.34);
		}
		puffs = puffs.filter(puff => puff.age < puff.ttl);
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

	function spinWeight(): number {
		if (directionState.phase === 'cruise') return 1;
		if (directionState.phase === 'decelerating' || directionState.phase === 'accelerating') {
			return clamp(directionState.speed / Math.max(0.0001, backgroundConfig.targetSpeed), 0, 1);
		}
		return 0;
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

	function wrapCoordinate(value: number, max: number): number {
		return ((value % max) + max) % max;
	}

	function wrapUnit(value: number): number {
		return wrapCoordinate(value, 1);
	}

	function getGridMetrics(
		width: number,
		height: number,
		spacing: number,
	): { columns: number; rows: number; spacing: number; spanX: number; spanY: number } {
		const safeSpacing = Math.max(minimumGridSpacing, spacing);
		gridColumns = Math.max(gridColumns, Math.ceil(width / minimumGridSpacing) + 4);
		gridRows = Math.max(gridRows, Math.ceil(height / minimumGridSpacing) + 4);
		return {
			columns: gridColumns,
			rows: gridRows,
			spacing: safeSpacing,
			spanX: gridColumns * safeSpacing,
			spanY: gridRows * safeSpacing,
		};
	}

	function gridX(column: number, metrics: ReturnType<typeof getGridMetrics>): number {
		return wrapCoordinate(column * metrics.spacing + flowPhaseX * metrics.spanX, metrics.spanX) - metrics.spacing * 2;
	}

	function gridY(row: number, metrics: ReturnType<typeof getGridMetrics>): number {
		return wrapCoordinate(row * metrics.spacing + flowPhaseY * metrics.spanY, metrics.spanY) - metrics.spacing * 2;
	}

	function isNearViewport(x: number, y: number, width: number, height: number, spacing: number): boolean {
		const margin = spacing * 0.7;
		return x > -margin && x < width + margin && y > -margin && y < height + margin;
	}

	function outsidePointNear(
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

	function randomSigned(min: number, max: number): number {
		return randomBetween(min, max) * (Math.random() < 0.5 ? -1 : 1);
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
		<div class="letter-field" aria-hidden="true">
			{#each cells as cell (cell.key)}
				{#if cell.visibility > 0}
					<span
						class="drift-letter"
						data-cell={cell.key}
						onpointerdown={event => popCell(cell.key, event)}
						style={`--x:${cell.x}px; --y:${cell.y}px; --r:${cell.rotation}rad; --o:${cell.opacity}; --s:${cell.scale}; --b:${cell.visibility};`}
					>
						{cell.char}
					</span>
				{/if}
			{/each}
			{#each puffs as puff (puff.id)}
				<span
					class="smoke-puff"
					style={`--x:${puff.x}px; --y:${puff.y}px; --r:${puff.rotation}deg; --o:${puff.opacity}; --s:${puff.scale};`}
				></span>
			{/each}
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
