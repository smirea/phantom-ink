<script lang="ts">
	import { BackgroundState, degreesToRadians } from '$lib/backgroundState.svelte';
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
	const spinClasses = ['spin-0', 'spin-1', 'spin-2', 'spin-3', 'spin-4', 'spin-5'] as const;
	let { state: backgroundState = new BackgroundState() }: { state?: BackgroundState } = $props();
	// svelte-ignore state_referenced_locally
	const backgroundConfig = backgroundState.config;

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
	let directionState = $state<DirectionState>(createDirectionState(0));
	let spacingState = $state<SpacingState>(createSpacingState(0));

	onMount(() => {
		backgroundState.resetMetrics('dom-svelte');
		const now = performance.now();
		directionState = createDirectionState(now);
		spacingState = createSpacingState(now);
		ensureCellCapacity(window.innerWidth, window.innerHeight, true);
		captureOnscreenState();
		applyGridTransform();
		nextCellLifeTickAt = now + backgroundConfig.cellLifeTickMs;

		let frame = 0;
		let lastTime = now;
		let lastFrame = 0;

		const tick = (now: number) => {
			const frameMs = lastFrame === 0 ? 0 : now - lastFrame;
			lastFrame = now;
			const updateStartedAt = performance.now();
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
			const finishedAt = performance.now();
			backgroundState.recordFrame(
				'dom-svelte',
				frameMs,
				finishedAt - updateStartedAt,
				0,
				cells.length,
				puffs.length,
				now,
			);
			frame = window.requestAnimationFrame(tick);
		};

		frame = window.requestAnimationFrame(tick);
		const stopActions = backgroundState.onAction(action => {
			if (action.type === 'direction') triggerDirectionChange();
			else if (action.type === 'spacing') triggerSpacingChange();
			else handleConfigChange(action.key);
		});
		return () => {
			stopActions();
			window.cancelAnimationFrame(frame);
		};
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

	function handleConfigChange(key: string): void {
		if (key === 'minimumGridSpacing') {
			ensureCellCapacity(window.innerWidth, window.innerHeight, false);
			applyCurrentSpacing(Math.max(spacingState.current, backgroundConfig.minimumGridSpacing));
		} else if (key === 'initialSpacing') {
			applyCurrentSpacing(backgroundConfig.initialSpacing);
		} else if (key === 'maxPuffs') {
			puffs = puffs.slice(-backgroundConfig.maxPuffs);
		} else if (key === 'cellLifeTickMs') {
			nextCellLifeTickAt = performance.now() + backgroundConfig.cellLifeTickMs;
		} else if (key === 'spacingChangeDelay') {
			rescheduleSpacingChange();
		} else if (key === 'directionChangeDelay') {
			rescheduleDirectionChange();
		}
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
</script>

<div
	class="letter-field"
	data-background-renderer="dom-svelte"
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
</style>
