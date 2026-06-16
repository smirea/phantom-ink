import type { BackgroundAction, BackgroundConfig, BackgroundState } from '$lib/backgroundState.svelte';
import { degreesToRadians } from '$lib/backgroundState.svelte';

export type EngineCellStatus = 'alive' | 'spawning' | 'dying' | 'dead';
export type DirectionPhase = 'cruise' | 'decelerating' | 'turning' | 'accelerating';

export type EngineCell = {
	index: number;
	id: number;
	key: string;
	char: string;
	column: number;
	row: number;
	opacity: number;
	scale: number;
	spinDuration: number;
	spinDirection: 1 | -1;
	status: EngineCellStatus;
	spawnMs: number;
	decayMs: number;
	spawnStartedAt: number;
	spawnDoneAt: number;
	deathStartedAt: number;
	deathAt: number;
	wasOnscreen: boolean;
	edgePuffTransition: number;
};

export type EnginePuff = {
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
	createdAt: number;
	removeAt: number;
	screenLocked: boolean;
};

export type CellVisual = {
	x: number;
	y: number;
	alpha: number;
	scale: number;
	spin: number;
	pointSize: number;
};

export type PuffVisual = {
	x: number;
	y: number;
	alpha: number;
	scale: number;
	rotation: number;
	pointSize: number;
};

type DirectionState = {
	angle: number;
	displayAngle: number;
	fromAngle: number;
	targetAngle: number;
	speed: number;
	speedFrom: number;
	spinStartedAt: number;
	phase: DirectionPhase;
	phaseStartedAt: number;
	phaseDuration: number;
};

type SpacingState = {
	current: number;
	from: number;
	target: number;
	anchorColumn: number;
	anchorRow: number;
	startedAt: number;
	duration: number;
	active: boolean;
	transitionId: number;
};

export class LetterGridEngine {
	cells: EngineCell[] = [];
	puffs: EnginePuff[] = [];
	gridShiftX = 0;
	gridShiftY = 0;
	gridColumns = 0;
	gridRows = 0;
	minColumn = 0;
	maxColumn = -1;
	minRow = 0;
	maxRow = -1;
	nextAutoEventAt = 0;
	nextCellLifeTickAt = 0;
	lastTime = 0;
	currentTime = 0;
	cellId = 0;
	smokeId = 0;
	revision = 0;
	smokeRevision = 0;
	dirtyCellIndexes = new Set<number>();
	direction: DirectionState;
	spacing: SpacingState;

	readonly state: BackgroundState;

	constructor(state: BackgroundState) {
		this.state = state;
		this.direction = this.createDirectionState(0);
		this.spacing = this.createSpacingState(0);
	}

	get config(): BackgroundConfig {
		return this.state.config;
	}

	update(now: number, width: number, height: number, allowAutoEvents = true): void {
		this.currentTime = now;
		if (this.lastTime === 0) {
			this.direction = this.createDirectionState(now);
			this.spacing = this.createSpacingState(now);
			this.scheduleNextAutoEvent(now);
			this.nextCellLifeTickAt = now + this.config.cellLifeTickMs;
			this.lastTime = now;
		}

		const elapsedMs = Math.max(0, Math.min(this.config.maxFrameMs, now - this.lastTime));
		this.lastTime = now;

		this.updateSpacing(now);
		this.updateDirection(now);
		this.updateAutoEvent(now, allowAutoEvents);
		this.updateGridMotion(elapsedMs);
		this.ensureCellCapacity(width, height, this.cells.length === 0);
		this.checkSpacingExpansionEdges(width, height);
		this.pruneExcessGridEdges(width, height);
		this.recycleGridEdges(width, height);
		this.updateCellLife(now);
	}

	handleAction(action: BackgroundAction, width: number, height: number, now = performance.now()): void {
		this.currentTime = now;
		if (action.type === 'direction') {
			this.startDirectionChange(now, action.angle, action.force);
		} else if (action.type === 'spacing') {
			this.startSpacingChange(now, action.spacing, action.force);
		} else {
			this.handleConfigChange(action.key, width, height, now);
		}
	}

	handleConfigChange(key: string, width: number, height: number, now = performance.now()): void {
		this.currentTime = now;
		if (key === 'minimumGridSpacing' || key === 'maximumGridSpacing') {
			this.ensureCellCapacity(width, height, false);
			this.requestSpacingChange(this.spacing.current, now, true);
		} else if (key === 'initialSpacing') {
			this.requestSpacingChange(this.config.initialSpacing, now, true);
		} else if (key === 'maxPuffs') {
			this.puffs = this.puffs.slice(-this.config.maxPuffs);
		} else if (key === 'cellLifeTickMs') {
			this.nextCellLifeTickAt = now + this.config.cellLifeTickMs;
		} else if (key === 'stateChangeDelay' && !this.hasActiveStateEvent()) {
			this.scheduleNextAutoEvent(now);
		} else if (key === 'glyphs' || key === 'specialGlyphs' || key === 'specialGlyphChance') {
			for (const cell of this.cells) {
				if (cell.status === 'dead') continue;
				cell.char = this.chooseGlyph();
				cell.scale = this.glyphScale(cell.char);
				this.markCellDirty(cell);
			}
			this.revision += 1;
		} else if (key === 'minGlyphScale' || key === 'maxGlyphScale' || key === 'glyphOpacity') {
			for (const cell of this.cells) {
				if (cell.status === 'dead') continue;
				cell.scale = this.glyphScale(cell.char);
				cell.opacity = randomRange(this.config.glyphOpacity);
				this.markCellDirty(cell);
			}
			this.revision += 1;
		}
	}

	consumeDirtyCellIndexes(): number[] {
		const indexes = [...this.dirtyCellIndexes];
		this.dirtyCellIndexes.clear();
		return indexes;
	}

	clearDirtyCellIndexes(): void {
		this.dirtyCellIndexes.clear();
	}

	cellCenter(cell: EngineCell): { x: number; y: number } {
		const spacing = this.spacing.current;
		return {
			x: (cell.column + 0.5) * spacing,
			y: (cell.row + 0.5) * spacing,
		};
	}

	cellScreenPoint(cell: EngineCell): { x: number; y: number } {
		const point = this.cellCenter(cell);
		return {
			x: this.gridShiftX + point.x,
			y: this.gridShiftY + point.y,
		};
	}

	popAt(screenX: number, screenY: number): boolean {
		let closest: EngineCell | undefined;
		let closestDistance = Infinity;
		const hitRadius = this.spacing.current * 0.52;
		for (const cell of this.cells) {
			if (cell.status === 'dead') continue;
			const point = this.cellScreenPoint(cell);
			const dx = screenX - point.x;
			const dy = screenY - point.y;
			const distance = Math.hypot(dx, dy);
			if (distance < hitRadius && distance < closestDistance) {
				closest = cell;
				closestDistance = distance;
			}
		}
		if (!closest) return false;
		this.popCell(closest);
		return true;
	}

	popCell(cell: EngineCell): void {
		if (cell.status === 'dead') return;
		const point = this.cellScreenPoint(cell);
		this.spawnSmoke(
			point.x,
			point.y,
			this.config.tapPuffCount,
			this.config.tapPuffIntensity,
			this.config.tapPuffTtlScale,
			true,
		);
		this.killCell(cell);
	}

	cellVisual(cell: EngineCell, now: number): CellVisual {
		const point = this.cellCenter(cell);
		let alpha = cell.opacity;
		let scale = cell.scale;
		if (cell.status === 'spawning') {
			const progress = smoothProgress((now - cell.spawnStartedAt) / cell.spawnMs);
			alpha *= progress;
			scale *= 0.28 + progress * 0.72;
		} else if (cell.status === 'dying') {
			const progress = smoothProgress((now - cell.deathStartedAt) / cell.decayMs);
			alpha *= 1 - progress;
			scale *= 1 - progress;
		}

		return {
			x: this.gridShiftX + point.x,
			y: this.gridShiftY + point.y,
			alpha,
			scale,
			spin: this.direction.displayAngle + this.cellSpin(cell, now),
			pointSize: this.spacing.current * Math.max(0.8, scale),
		};
	}

	puffVisual(puff: EnginePuff, now: number): PuffVisual {
		const progress = smoothProgress((now - puff.createdAt) / puff.ttl);
		const alpha = puff.opacity * Math.sin(Math.PI * progress);
		return {
			x: this.gridShiftX + puff.x + puff.dx * progress,
			y: this.gridShiftY + puff.y + puff.dy * progress,
			alpha,
			scale: puff.scale + (puff.endScale - puff.scale) * progress,
			rotation: puff.rotation + puff.endRotation * progress,
			pointSize: this.spacing.current * Math.max(0.5, puff.scale + (puff.endScale - puff.scale) * progress),
		};
	}

	private ensureCellCapacity(width: number, height: number, seedAlive: boolean): void {
		const spacing = this.capacitySpacing();
		const required = this.getRequiredGridSize(width, height, spacing);
		if (this.cells.length === 0) {
			this.initializeCells(required.columns, required.rows, seedAlive);
			return;
		}

		const spawnNew = this.spacing.active && this.spacing.target < this.spacing.from;
		const padding = spacing * this.config.gridPaddingCells;
		const maxColumns = required.columns + this.config.gridPaddingCells * 4 + 8;
		const maxRows = required.rows + this.config.gridPaddingCells * 4 + 8;
		const shiftX = this.capacityGridShiftX(spacing);
		const shiftY = this.capacityGridShiftY(spacing);
		let guard = 0;
		while (shiftX + (this.minColumn + 0.5) * spacing > -padding && this.gridColumns < maxColumns && guard < 200) {
			this.addColumn('left', spawnNew);
			guard += 1;
		}
		while (
			shiftX + (this.maxColumn + 0.5) * spacing < width + padding &&
			this.gridColumns < maxColumns &&
			guard < 400
		) {
			this.addColumn('right', spawnNew);
			guard += 1;
		}
		while (this.gridColumns < required.columns && this.gridColumns < maxColumns && guard < 600) {
			this.addColumn(this.nextColumnSide(width, spacing, shiftX), spawnNew);
			guard += 1;
		}

		guard = 0;
		while (shiftY + (this.minRow + 0.5) * spacing > -padding && this.gridRows < maxRows && guard < 200) {
			this.addRow('top', spawnNew);
			guard += 1;
		}
		while (shiftY + (this.maxRow + 0.5) * spacing < height + padding && this.gridRows < maxRows && guard < 400) {
			this.addRow('bottom', spawnNew);
			guard += 1;
		}
		while (this.gridRows < required.rows && this.gridRows < maxRows && guard < 600) {
			this.addRow(this.nextRowSide(height, spacing, shiftY), spawnNew);
			guard += 1;
		}
	}

	private initializeCells(columns: number, rows: number, seedAlive: boolean): void {
		this.minColumn = -this.config.gridPaddingCells;
		this.maxColumn = this.minColumn + columns - 1;
		this.minRow = -this.config.gridPaddingCells;
		this.maxRow = this.minRow + rows - 1;
		this.gridColumns = columns;
		this.gridRows = rows;

		const nextCells: EngineCell[] = [];
		for (let row = this.minRow; row <= this.maxRow; row += 1) {
			for (let column = this.minColumn; column <= this.maxColumn; column += 1) {
				nextCells.push(this.createGridCell(column, row, seedAlive, nextCells.length));
			}
		}
		this.cells = nextCells;
		this.revision += 1;
	}

	private addColumn(side: 'left' | 'right', spawnNew: boolean): void {
		const column = side === 'left' ? this.minColumn - 1 : this.maxColumn + 1;
		const nextCells: EngineCell[] = [];
		for (let row = this.minRow; row <= this.maxRow; row += 1) {
			nextCells.push(this.createGridCell(column, row, true, this.cells.length + nextCells.length, spawnNew));
		}
		this.cells = [...this.cells, ...nextCells];
		if (side === 'left') this.minColumn = column;
		else this.maxColumn = column;
		this.gridColumns += 1;
		this.revision += 1;
	}

	private addRow(side: 'top' | 'bottom', spawnNew: boolean): void {
		const row = side === 'top' ? this.minRow - 1 : this.maxRow + 1;
		const nextCells: EngineCell[] = [];
		for (let column = this.minColumn; column <= this.maxColumn; column += 1) {
			nextCells.push(this.createGridCell(column, row, true, this.cells.length + nextCells.length, spawnNew));
		}
		this.cells = [...this.cells, ...nextCells];
		if (side === 'top') this.minRow = row;
		else this.maxRow = row;
		this.gridRows += 1;
		this.revision += 1;
	}

	private createGridCell(column: number, row: number, seedAlive: boolean, index: number, spawnNew = false): EngineCell {
		const char = this.chooseGlyph();
		const status: EngineCellStatus =
			seedAlive && Math.random() < this.config.targetAliveRatio ? (spawnNew ? 'spawning' : 'alive') : 'dead';
		const spawnMs = randomRange(this.config.spawnMs);
		const cell: EngineCell = {
			index,
			id: (this.cellId += 1),
			key: `engine-cell-${this.cellId}`,
			char,
			column,
			row,
			opacity: randomRange(this.config.glyphOpacity),
			scale: this.glyphScale(char),
			spinDuration: randomBetween(18000, 44000),
			spinDirection: Math.random() < 0.5 ? -1 : 1,
			status,
			spawnMs,
			decayMs: randomRange(this.config.naturalDecayMs),
			spawnStartedAt: status === 'spawning' ? this.currentTime : 0,
			spawnDoneAt: status === 'spawning' ? this.currentTime + spawnMs : 0,
			deathStartedAt: 0,
			deathAt: 0,
			wasOnscreen: false,
			edgePuffTransition: 0,
		};
		this.markCellDirty(cell);
		return cell;
	}

	private updateCellLife(now: number): void {
		if (now < this.nextCellLifeTickAt) return;
		this.nextCellLifeTickAt = now + this.config.cellLifeTickMs;

		let activePuffCount = 0;
		for (const puff of this.puffs) {
			if (now >= puff.removeAt) continue;
			this.puffs[activePuffCount] = puff;
			activePuffCount += 1;
		}
		if (activePuffCount !== this.puffs.length) {
			this.puffs.length = activePuffCount;
			this.smokeRevision += 1;
		}

		const total = Math.max(1, this.cells.length);
		let living = 0;
		for (const cell of this.cells) {
			if (cell.status === 'alive' || cell.status === 'spawning') living += 1;
		}
		const occupancy = living / total;
		const tickSeconds = this.config.cellLifeTickMs / 1000;
		const spawnPressure = Math.max(0, (this.config.targetAliveRatio - occupancy) / this.config.targetAliveRatio);
		const decayPressure = Math.max(0, (occupancy - this.config.targetAliveRatio) / (1 - this.config.targetAliveRatio));

		for (const cell of this.cells) {
			if (cell.status === 'spawning') {
				if (now >= cell.spawnDoneAt) {
					cell.status = 'alive';
					this.markCellDirty(cell);
					this.revision += 1;
				}
			} else if (cell.status === 'dying') {
				if (now >= cell.deathAt) this.killCell(cell);
			} else if (cell.status === 'dead') {
				if (
					Math.random() <
					(this.config.spawnBaseChancePerSecond + spawnPressure * this.config.spawnPressureChancePerSecond) *
						tickSeconds
				) {
					this.spawnCell(cell, now);
				}
			} else if (
				Math.random() <
				(this.config.decayBaseChancePerSecond + decayPressure * this.config.decayPressureChancePerSecond) * tickSeconds
			) {
				this.fadeCell(cell, now);
			}
		}
	}

	private spawnCell(cell: EngineCell, now: number): void {
		cell.char = this.chooseGlyph();
		cell.opacity = randomRange(this.config.glyphOpacity);
		cell.scale = this.glyphScale(cell.char);
		cell.spinDuration = randomBetween(18000, 44000);
		cell.spinDirection = Math.random() < 0.5 ? -1 : 1;
		cell.spawnMs = randomRange(this.config.spawnMs);
		cell.decayMs = randomRange(this.config.naturalDecayMs);
		cell.spawnStartedAt = now;
		cell.spawnDoneAt = now + cell.spawnMs;
		cell.deathStartedAt = 0;
		cell.deathAt = 0;
		cell.status = 'spawning';
		this.markCellDirty(cell);
		this.revision += 1;
	}

	private fadeCell(cell: EngineCell, now: number): void {
		if (cell.status !== 'alive') return;
		cell.decayMs = randomRange(this.config.naturalDecayMs);
		cell.deathStartedAt = now;
		cell.deathAt = now + cell.decayMs;
		cell.status = 'dying';
		this.markCellDirty(cell);
		this.revision += 1;
	}

	private killCell(cell: EngineCell): void {
		if (cell.status === 'dead') return;
		cell.status = 'dead';
		cell.spawnStartedAt = 0;
		cell.spawnDoneAt = 0;
		cell.deathStartedAt = 0;
		cell.deathAt = 0;
		this.markCellDirty(cell);
		this.revision += 1;
	}

	private updateSpacing(now: number): void {
		if (!this.spacing.active) return;

		const previousSpacing = this.spacing.current;
		const progress = smoothProgress((now - this.spacing.startedAt) / this.spacing.duration);
		this.spacing.current = this.spacing.from + (this.spacing.target - this.spacing.from) * progress;
		this.adjustGridShiftForSpacing(previousSpacing, this.spacing.current);
		if (progress >= 1) {
			this.spacing.current = this.spacing.target;
			this.spacing.active = false;
			this.scheduleNextAutoEvent(now);
		}
	}

	private updateDirection(now: number): void {
		if (this.direction.phase === 'decelerating') {
			const progress = smoothProgress((now - this.direction.phaseStartedAt) / this.direction.phaseDuration);
			this.direction.speed = this.direction.speedFrom * (1 - progress);
			if (progress >= 1) {
				this.direction.speed = 0;
				this.direction.phase = 'turning';
				this.direction.phaseStartedAt = now;
				this.direction.phaseDuration = this.config.turnMs;
			}
		} else if (this.direction.phase === 'turning') {
			const progress = smoothProgress((now - this.direction.phaseStartedAt) / this.direction.phaseDuration);
			this.direction.displayAngle = lerpAngle(this.direction.fromAngle, this.direction.targetAngle, progress);
			if (progress >= 1) {
				this.direction.angle = this.direction.targetAngle;
				this.direction.displayAngle = this.direction.targetAngle;
				this.direction.phase = 'accelerating';
				this.direction.phaseStartedAt = now;
				this.direction.phaseDuration = this.config.accelerationMs;
			}
		} else if (this.direction.phase === 'accelerating') {
			const progress = smoothProgress((now - this.direction.phaseStartedAt) / this.direction.phaseDuration);
			this.direction.speed = this.config.targetSpeed * progress;
			if (progress >= 1) {
				this.direction.speed = this.config.targetSpeed;
				this.direction.phase = 'cruise';
				this.direction.spinStartedAt = now;
				this.scheduleNextAutoEvent(now);
			}
		}

		if (this.direction.phase === 'cruise') {
			this.direction.displayAngle = this.direction.angle;
			this.direction.speed = this.config.targetSpeed;
		}
	}

	private updateAutoEvent(now: number, allowAutoEvents: boolean): void {
		if (this.hasActiveStateEvent()) return;
		if (this.nextAutoEventAt === 0) this.scheduleNextAutoEvent(now);
		if (now < this.nextAutoEventAt) return;
		if (!allowAutoEvents) {
			this.scheduleNextAutoEvent(now);
			return;
		}

		this.nextAutoEventAt = Number.POSITIVE_INFINITY;
		const firstKind = Math.random() < 0.5 ? 'spacing' : 'direction';
		const secondKind = firstKind === 'spacing' ? 'direction' : 'spacing';
		if (!this.startAutoEvent(firstKind, now) && !this.startAutoEvent(secondKind, now)) {
			this.scheduleNextAutoEvent(now);
		}
	}

	private startAutoEvent(kind: 'direction' | 'spacing', now: number): boolean {
		return kind === 'spacing' ? this.startSpacingChange(now) : this.startDirectionChange(now);
	}

	private updateGridMotion(elapsedMs: number): void {
		if (this.direction.phase === 'turning') return;
		this.gridShiftX += Math.cos(this.direction.angle) * this.direction.speed * elapsedMs;
		this.gridShiftY += Math.sin(this.direction.angle) * this.direction.speed * elapsedMs;
	}

	private recycleGridEdges(width: number, height: number): void {
		if (this.gridColumns <= 0 || this.gridRows <= 0) return;

		const spacing = this.spacing.current;
		const margin = spacing * this.config.recycleMarginCells;
		const velocityX = Math.cos(this.direction.angle) * this.direction.speed;
		const velocityY = Math.sin(this.direction.angle) * this.direction.speed;
		const threshold = this.config.velocityRecycleThreshold;

		if (velocityX > threshold) {
			while (this.gridShiftX + this.maxColumn * spacing > width + margin) {
				this.recycleColumn(this.maxColumn, this.minColumn - 1);
			}
		} else if (velocityX < -threshold) {
			while (this.gridShiftX + (this.minColumn + 1) * spacing < -margin) {
				this.recycleColumn(this.minColumn, this.maxColumn + 1);
			}
		}

		if (velocityY > threshold) {
			while (this.gridShiftY + this.maxRow * spacing > height + margin) {
				this.recycleRow(this.maxRow, this.minRow - 1);
			}
		} else if (velocityY < -threshold) {
			while (this.gridShiftY + (this.minRow + 1) * spacing < -margin) {
				this.recycleRow(this.minRow, this.maxRow + 1);
			}
		}
	}

	private recycleColumn(fromColumn: number, toColumn: number): void {
		let changed = false;
		for (const cell of this.cells) {
			if (cell.column !== fromColumn) continue;
			cell.column = toColumn;
			cell.wasOnscreen = false;
			cell.edgePuffTransition = 0;
			this.markCellDirty(cell);
			changed = true;
		}

		if (fromColumn === this.maxColumn && toColumn < this.minColumn) {
			this.minColumn = toColumn;
			this.maxColumn -= 1;
		} else if (fromColumn === this.minColumn && toColumn > this.maxColumn) {
			this.minColumn += 1;
			this.maxColumn = toColumn;
		}
		if (changed) this.revision += 1;
	}

	private pruneExcessGridEdges(width: number, height: number): void {
		if (this.gridColumns <= 0 || this.gridRows <= 0) return;
		if (this.spacing.active && this.spacing.target < this.spacing.from) return;

		const required = this.getRequiredGridSize(width, height, this.pruneSpacing());
		const spacing = Math.max(1, this.spacing.current || this.config.initialSpacing);
		const margin = spacing * this.config.recycleMarginCells;
		let removeLeftColumns = 0;
		let removeRightColumns = 0;
		let removeTopRows = 0;
		let removeBottomRows = 0;
		let guard = 0;

		while (this.gridColumns - removeLeftColumns - removeRightColumns > required.columns && guard < 200) {
			const leftColumn = this.minColumn + removeLeftColumns;
			const rightColumn = this.maxColumn - removeRightColumns;
			if (this.canRemoveColumn(leftColumn, 'left', width, spacing, margin)) {
				removeLeftColumns += 1;
			} else if (this.canRemoveColumn(rightColumn, 'right', width, spacing, margin)) {
				removeRightColumns += 1;
			} else {
				break;
			}
			guard += 1;
		}

		guard = 0;
		while (this.gridRows - removeTopRows - removeBottomRows > required.rows && guard < 200) {
			const topRow = this.minRow + removeTopRows;
			const bottomRow = this.maxRow - removeBottomRows;
			if (this.canRemoveRow(topRow, 'top', height, spacing, margin)) {
				removeTopRows += 1;
			} else if (this.canRemoveRow(bottomRow, 'bottom', height, spacing, margin)) {
				removeBottomRows += 1;
			} else {
				break;
			}
			guard += 1;
		}

		const removedColumns = removeLeftColumns + removeRightColumns;
		const removedRows = removeTopRows + removeBottomRows;
		if (removedColumns + removedRows === 0) return;

		this.minColumn += removeLeftColumns;
		this.maxColumn -= removeRightColumns;
		this.minRow += removeTopRows;
		this.maxRow -= removeBottomRows;
		this.gridColumns -= removedColumns;
		this.gridRows -= removedRows;
		this.cells = this.cells.filter(
			cell =>
				cell.column >= this.minColumn &&
				cell.column <= this.maxColumn &&
				cell.row >= this.minRow &&
				cell.row <= this.maxRow,
		);
		this.reindexCells();
		this.revision += 1;
	}

	private canRemoveColumn(
		column: number,
		side: 'left' | 'right',
		width: number,
		spacing: number,
		margin: number,
	): boolean {
		const x = this.gridShiftX + (column + 0.5) * spacing;
		return side === 'left' ? x < -margin : x > width + margin;
	}

	private canRemoveRow(row: number, side: 'top' | 'bottom', height: number, spacing: number, margin: number): boolean {
		const y = this.gridShiftY + (row + 0.5) * spacing;
		return side === 'top' ? y < -margin : y > height + margin;
	}

	private reindexCells(): void {
		this.dirtyCellIndexes.clear();
		for (let index = 0; index < this.cells.length; index += 1) {
			this.cells[index].index = index;
			this.markCellDirty(this.cells[index]);
		}
	}

	private markCellDirty(cell: EngineCell): void {
		this.dirtyCellIndexes.add(cell.index);
	}

	private recycleRow(fromRow: number, toRow: number): void {
		let changed = false;
		for (const cell of this.cells) {
			if (cell.row !== fromRow) continue;
			cell.row = toRow;
			cell.wasOnscreen = false;
			cell.edgePuffTransition = 0;
			this.markCellDirty(cell);
			changed = true;
		}

		if (fromRow === this.maxRow && toRow < this.minRow) {
			this.minRow = toRow;
			this.maxRow -= 1;
		} else if (fromRow === this.minRow && toRow > this.maxRow) {
			this.minRow += 1;
			this.maxRow = toRow;
		}
		if (changed) this.revision += 1;
	}

	private spawnSmoke(
		x: number,
		y: number,
		count: number,
		intensity: number,
		ttlScale: number,
		screenLocked = false,
	): void {
		if (count <= 0 || intensity <= 0 || ttlScale <= 0) return;
		const now = this.currentTime;
		const angle = screenLocked ? -Math.PI / 2 + randomBetween(-0.55, 0.55) : Math.random() * Math.PI * 2;
		const countScale = Math.max(1, Math.sqrt(count));
		const distance =
			randomRange(this.config.smokeDistance) * intensity * (screenLocked ? 0.9 : 0.45 + countScale * 0.04);
		const scale = randomRange(this.config.smokeScale) * intensity * (0.85 + countScale * 0.12);
		const ttl = randomRange(this.config.smokeTtlMs) * ttlScale;
		this.puffs.push({
			id: (this.smokeId += 1),
			x,
			y,
			dx: Math.cos(angle) * distance,
			dy: Math.sin(angle) * distance,
			rotation: Math.random() * 360,
			endRotation: randomRange(this.config.smokeEndRotation),
			opacity: randomRange(this.config.smokeOpacity) * intensity * Math.min(1.45, 0.5 + countScale * 0.08),
			scale,
			endScale: scale + randomRange(this.config.smokeEndScaleAdd) * intensity * (0.7 + countScale * 0.08),
			ttl,
			createdAt: now,
			removeAt: now + ttl,
			screenLocked,
		});
		if (this.puffs.length > this.config.maxPuffs) this.puffs.splice(0, this.puffs.length - this.config.maxPuffs);
		this.smokeRevision += 1;
	}

	private createDirectionState(now: number): DirectionState {
		return {
			angle: 0,
			displayAngle: 0,
			fromAngle: 0,
			targetAngle: 0,
			speed: this.config.targetSpeed,
			speedFrom: this.config.targetSpeed,
			spinStartedAt: now,
			phase: 'cruise',
			phaseStartedAt: now,
			phaseDuration: 0,
		};
	}

	private createSpacingState(now: number): SpacingState {
		const initialSpacing = Math.max(this.config.minimumGridSpacing, this.config.initialSpacing);
		return {
			current: initialSpacing,
			from: initialSpacing,
			target: initialSpacing,
			anchorColumn: 0,
			anchorRow: 0,
			startedAt: now,
			duration: 0,
			active: false,
			transitionId: 0,
		};
	}

	private startSpacingChange(now: number, spacing?: number, force = false): boolean {
		return this.requestSpacingChange(spacing ?? this.chooseSpacing(this.spacing.current), now, force);
	}

	private requestSpacingChange(spacing: number, now: number, force = false): boolean {
		const nextSpacing = this.constrainSpacing(spacing);
		if (!force && Math.abs(nextSpacing - this.spacing.current) < this.config.spacingChangeThreshold) {
			return false;
		}
		if (!force && this.hasActiveStateEvent()) return false;
		if (Math.abs(nextSpacing - this.spacing.current) < 0.001) return false;

		this.normalizeGridOrigin(this.spacing.current);
		this.captureOnscreenState();
		this.spacing.from = this.spacing.current;
		this.spacing.target = nextSpacing;
		this.spacing.anchorColumn = this.viewportAnchorColumn(this.spacing.current);
		this.spacing.anchorRow = this.viewportAnchorRow(this.spacing.current);
		this.spacing.startedAt = now;
		this.spacing.duration = Math.max(1, randomRange(this.config.spacingTransitionMs));
		this.spacing.active = true;
		this.spacing.transitionId += 1;
		this.nextAutoEventAt = Number.POSITIVE_INFINITY;
		this.ensureCellCapacity(this.viewportWidth(), this.viewportHeight(), false);
		return true;
	}

	private startDirectionChange(now: number, targetAngle?: number, force = false): boolean {
		if (!force && this.hasActiveStateEvent()) return false;

		this.direction.angle = this.direction.displayAngle;
		this.direction.fromAngle = this.direction.displayAngle;
		this.direction.targetAngle = targetAngle ?? this.chooseDirection(this.direction.displayAngle);
		if (Math.abs(shortestAngle(this.direction.displayAngle, this.direction.targetAngle)) < 0.0001) return false;
		this.direction.speedFrom = this.direction.speed;
		this.direction.phaseStartedAt = now;
		this.nextAutoEventAt = Number.POSITIVE_INFINITY;

		if (this.direction.speed <= 0.001) {
			this.direction.speed = 0;
			this.direction.phase = 'turning';
			this.direction.phaseDuration = this.config.turnMs;
			return true;
		}

		this.direction.phase = 'decelerating';
		this.direction.phaseDuration = this.config.decelerationMs;
		return true;
	}

	private hasActiveStateEvent(): boolean {
		return this.spacing.active || this.direction.phase !== 'cruise';
	}

	private scheduleNextAutoEvent(now: number): void {
		if (this.hasActiveStateEvent()) return;
		this.nextAutoEventAt = now + randomRange(this.config.stateChangeDelay);
	}

	private chooseDirection(current: number): number {
		const minimumTurn = degreesToRadians(30);
		const oppositeTurn = Math.PI;
		const epsilon = degreesToRadians(0.1);
		const options = this.config.directionOptions.filter(angle => {
			const distance = Math.abs(shortestAngle(current, angle));
			return distance >= minimumTurn - epsilon && Math.abs(distance - oppositeTurn) > epsilon;
		});
		if (options.length > 0) return options[Math.floor(Math.random() * options.length)];

		const fallback = this.config.directionOptions.reduce(
			(best, angle) => {
				const distance = Math.abs(shortestAngle(current, angle));
				return distance > best.distance && Math.abs(distance - oppositeTurn) > epsilon ? { angle, distance } : best;
			},
			{ angle: 0, distance: 0 },
		);
		return fallback.angle;
	}

	private chooseGlyph(): string {
		const specialGlyphs = this.config.specialGlyphs;
		if (specialGlyphs.length > 0 && Math.random() < this.config.specialGlyphChance) {
			return specialGlyphs[Math.floor(Math.random() * specialGlyphs.length)];
		}
		return this.config.glyphs[Math.floor(Math.random() * this.config.glyphs.length)] ?? 'P';
	}

	private glyphScale(char: string): number {
		return this.config.specialGlyphs.includes(char)
			? this.config.maxGlyphScale
			: randomBetween(this.config.minGlyphScale, this.config.maxGlyphScale);
	}

	private chooseSpacing(current: number): number {
		const minSpacing = Math.max(1, Math.round(this.config.minimumGridSpacing));
		const maxSpacing = Math.max(minSpacing, Math.round(this.config.maximumGridSpacing));
		const ratio = Math.max(0, this.config.spacingOptionMinRatio);
		const lowerMax = Math.min(maxSpacing, Math.floor(current * (1 - ratio)));
		const upperMin = Math.max(minSpacing, Math.ceil(current * (1 + ratio)));
		const ranges: { min: number; max: number; weight: number }[] = [];

		if (lowerMax >= minSpacing) ranges.push({ min: minSpacing, max: lowerMax, weight: lowerMax - minSpacing + 1 });
		if (upperMin <= maxSpacing) ranges.push({ min: upperMin, max: maxSpacing, weight: maxSpacing - upperMin + 1 });
		if (ranges.length === 0)
			return Math.abs(current - minSpacing) > Math.abs(maxSpacing - current) ? minSpacing : maxSpacing;

		let pick = Math.random() * ranges.reduce((total, range) => total + range.weight, 0);
		for (const range of ranges) {
			if (pick <= range.weight) return Math.round(randomBetween(range.min, range.max));
			pick -= range.weight;
		}
		const fallback = ranges[ranges.length - 1];
		return Math.round(randomBetween(fallback.min, fallback.max));
	}

	private constrainSpacing(spacing: number): number {
		const minSpacing = Math.max(1, Math.round(this.config.minimumGridSpacing));
		const maxSpacing = Math.max(minSpacing, Math.round(this.config.maximumGridSpacing));
		return Math.min(maxSpacing, Math.max(minSpacing, Math.round(spacing)));
	}

	private normalizeGridOrigin(spacing: number): void {
		const safeSpacing = Math.max(1, spacing);
		const width = typeof window === 'undefined' ? 0 : window.innerWidth;
		const height = typeof window === 'undefined' ? 0 : window.innerHeight;
		const columnOffset = Math.round((width * 0.5 - this.gridShiftX) / safeSpacing - 0.5);
		const rowOffset = Math.round((height * 0.5 - this.gridShiftY) / safeSpacing - 0.5);
		if (columnOffset === 0 && rowOffset === 0) return;

		const xOffset = columnOffset * safeSpacing;
		const yOffset = rowOffset * safeSpacing;
		this.gridShiftX += xOffset;
		this.gridShiftY += yOffset;
		this.minColumn -= columnOffset;
		this.maxColumn -= columnOffset;
		this.minRow -= rowOffset;
		this.maxRow -= rowOffset;
		for (const cell of this.cells) {
			cell.column -= columnOffset;
			cell.row -= rowOffset;
			this.markCellDirty(cell);
		}
		for (const puff of this.puffs) {
			if (puff.screenLocked) continue;
			puff.x -= xOffset;
			puff.y -= yOffset;
		}
		this.revision += 1;
		this.smokeRevision += 1;
	}

	private adjustGridShiftForSpacing(previousSpacing: number, nextSpacing: number): void {
		const delta = previousSpacing - nextSpacing;
		if (Math.abs(delta) < 0.0001) return;
		const xOffset = delta * (this.spacing.anchorColumn + 0.5);
		const yOffset = delta * (this.spacing.anchorRow + 0.5);
		this.gridShiftX += xOffset;
		this.gridShiftY += yOffset;
		for (const puff of this.puffs) {
			if (puff.screenLocked) continue;
			puff.x -= xOffset;
			puff.y -= yOffset;
		}
		this.smokeRevision += 1;
	}

	private viewportAnchorColumn(spacing: number): number {
		return (this.viewportWidth() * 0.5 - this.gridShiftX) / Math.max(1, spacing) - 0.5;
	}

	private viewportAnchorRow(spacing: number): number {
		return (this.viewportHeight() * 0.5 - this.gridShiftY) / Math.max(1, spacing) - 0.5;
	}

	private viewportWidth(): number {
		return typeof window === 'undefined' ? 0 : window.innerWidth;
	}

	private viewportHeight(): number {
		return typeof window === 'undefined' ? 0 : window.innerHeight;
	}

	private capacitySpacing(): number {
		const fallback = this.config.initialSpacing || this.config.minimumGridSpacing;
		const spacing = this.spacing.active
			? Math.min(this.spacing.current || fallback, this.spacing.target || fallback)
			: this.spacing.current || fallback;
		return Math.max(1, spacing);
	}

	private pruneSpacing(): number {
		const fallback = this.config.initialSpacing || this.config.minimumGridSpacing;
		const spacing = this.spacing.active
			? Math.max(this.spacing.current || fallback, this.spacing.target || fallback)
			: this.spacing.current || fallback;
		return Math.max(1, spacing);
	}

	private capacityGridShiftX(spacing: number): number {
		if (!this.spacing.active || this.spacing.target >= this.spacing.from) return this.gridShiftX;
		return this.gridShiftX + (this.spacing.current - spacing) * (this.spacing.anchorColumn + 0.5);
	}

	private capacityGridShiftY(spacing: number): number {
		if (!this.spacing.active || this.spacing.target >= this.spacing.from) return this.gridShiftY;
		return this.gridShiftY + (this.spacing.current - spacing) * (this.spacing.anchorRow + 0.5);
	}

	private nextColumnSide(width: number, spacing: number, shiftX = this.gridShiftX): 'left' | 'right' {
		const leftGap = shiftX + (this.minColumn + 0.5) * spacing;
		const rightGap = width - (shiftX + (this.maxColumn + 0.5) * spacing);
		return leftGap > rightGap ? 'left' : 'right';
	}

	private nextRowSide(height: number, spacing: number, shiftY = this.gridShiftY): 'top' | 'bottom' {
		const topGap = shiftY + (this.minRow + 0.5) * spacing;
		const bottomGap = height - (shiftY + (this.maxRow + 0.5) * spacing);
		return topGap > bottomGap ? 'top' : 'bottom';
	}

	private getRequiredGridSize(width: number, height: number, spacing: number): { columns: number; rows: number } {
		const safeSpacing = Math.max(1, spacing);
		return {
			columns: Math.ceil(width / safeSpacing) + this.config.gridPaddingCells * 2,
			rows: Math.ceil(height / safeSpacing) + this.config.gridPaddingCells * 2,
		};
	}

	private checkSpacingExpansionEdges(width: number, height: number): void {
		if (!this.spacing.active || this.spacing.target <= this.spacing.from) return;

		for (const cell of this.cells) {
			if (cell.status === 'dead') continue;

			const point = this.cellScreenPoint(cell);
			const onscreen = this.isNearViewportPoint(point.x, point.y, width, height, this.spacing.current);
			if (cell.wasOnscreen && !onscreen && cell.edgePuffTransition !== this.spacing.transitionId) {
				const edgePoint = this.outsidePointNearViewport(point.x, point.y, width, height, this.spacing.current);
				const gridPoint = { x: edgePoint.x - this.gridShiftX, y: edgePoint.y - this.gridShiftY };
				cell.edgePuffTransition = this.spacing.transitionId;
				this.spawnSmoke(
					gridPoint.x,
					gridPoint.y,
					this.config.edgePuffCount,
					this.config.edgePuffIntensity,
					this.config.edgePuffTtlScale,
				);
				this.killCell(cell);
			}
			cell.wasOnscreen = onscreen;
		}
	}

	private captureOnscreenState(): void {
		for (const cell of this.cells) {
			const point = this.cellScreenPoint(cell);
			cell.wasOnscreen = this.isNearViewportPoint(
				point.x,
				point.y,
				window.innerWidth,
				window.innerHeight,
				this.spacing.current,
			);
			cell.edgePuffTransition = 0;
		}
	}

	private outsidePointNearViewport(
		x: number,
		y: number,
		width: number,
		height: number,
		spacing: number,
	): { x: number; y: number } {
		const padded = spacing * this.config.edgePuffOutsidePaddingCells;
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

	private isNearViewportPoint(x: number, y: number, width: number, height: number, spacing: number): boolean {
		const margin = spacing * this.config.edgePuffViewportMarginCells;
		return x > -margin && x < width + margin && y > -margin && y < height + margin;
	}

	private cellSpin(cell: EngineCell, now: number): number {
		if (this.direction.phase !== 'cruise') return 0;
		return (
			(((now - this.direction.spinStartedAt) / cell.spinDuration) * Math.PI * 2 * cell.spinDirection) % (Math.PI * 2)
		);
	}
}

export function smoothProgress(value: number): number {
	const progress = Math.min(1, Math.max(0, value));
	return progress * progress * (3 - 2 * progress);
}

export function randomBetween(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

export function randomRange(range: readonly [number, number]): number {
	return randomBetween(range[0], range[1]);
}

function lerpAngle(from: number, to: number, progress: number): number {
	return from + shortestAngle(from, to) * progress;
}

function shortestAngle(from: number, to: number): number {
	return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
