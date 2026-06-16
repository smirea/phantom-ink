<script lang="ts">
	import { type BackgroundState, clamp, degreesToRadians } from '$lib/backgroundState.svelte';

	type NumberKey =
		| 'targetAliveRatio'
		| 'initialSpacing'
		| 'targetSpeed'
		| 'spinSpeedMultiplier'
		| 'tapPuffIntensity'
		| 'specialGlyphChance'
		| 'targetFps'
		| 'renderPixelRatio';
	type BooleanKey = 'antialias';
	type RangeKey = 'glyphOpacity' | 'smokeTtlMs' | 'minGlyphScale' | 'maxGlyphScale';
	type NumberControl = {
		key: NumberKey;
		label: string;
		min: number;
		max: number;
		step: number;
		format?: (value: number) => string;
		apply?: (value: number) => void;
	};

	let { state: backgroundState }: { state: BackgroundState } = $props();
	let directionDegrees = $state(0);

	const numberControls: NumberControl[] = [
		{
			key: 'targetAliveRatio',
			label: 'Density',
			min: 0.35,
			max: 0.96,
			step: 0.01,
			format: value => `${Math.round(value * 100)}%`,
		},
		{
			key: 'initialSpacing',
			label: 'Spacing',
			min: 44,
			max: 120,
			step: 1,
			format: value => `${Math.round(value)}px`,
			apply: value => backgroundState.triggerSpacingChange(value),
		},
		{
			key: 'targetSpeed',
			label: 'Speed',
			min: 0.004,
			max: 0.06,
			step: 0.001,
			format: value => value.toFixed(3),
		},
		{
			key: 'spinSpeedMultiplier',
			label: 'Rotation',
			min: 0,
			max: 3,
			step: 0.05,
			format: value => `${value.toFixed(2)}x`,
		},
		{
			key: 'tapPuffIntensity',
			label: 'Tap Flame',
			min: 0,
			max: 2.4,
			step: 0.05,
			format: value => value.toFixed(2),
		},
		{
			key: 'specialGlyphChance',
			label: 'Faces',
			min: 0,
			max: 0.12,
			step: 0.005,
			format: value => `${Math.round(value * 100)}%`,
		},
		{
			key: 'targetFps',
			label: 'FPS',
			min: 15,
			max: 120,
			step: 1,
			format: value => `${Math.round(value)}`,
		},
		{
			key: 'renderPixelRatio',
			label: 'DPR',
			min: 0.5,
			max: 2,
			step: 0.05,
			format: value => value.toFixed(2),
		},
	];

	function configValue(key: NumberKey): number {
		return backgroundState.config[key];
	}

	function updateNumber(control: NumberControl, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const value = clamp(Number(input.value), control.min, control.max);
		if (!Number.isFinite(value)) return;
		backgroundState.config[control.key] = value;
		if (control.key === 'initialSpacing') {
			backgroundState.config.minimumGridSpacing = Math.min(value, backgroundState.config.minimumGridSpacing);
			backgroundState.config.spacingOptions = uniqueSpacingOptions(value, backgroundState.config.spacingOptions);
		}
		backgroundState.notifyConfigChanged(control.key);
		control.apply?.(value);
	}

	function updateBoolean(key: BooleanKey, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		backgroundState.config[key] = input.checked;
		backgroundState.notifyConfigChanged(key);
	}

	function updateDirection(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const value = Math.round(clamp(Number(input.value), 0, 345) / 15) * 15;
		if (!Number.isFinite(value)) return;
		directionDegrees = value;
		backgroundState.triggerDirectionChange(degreesToRadians(value));
	}

	function updateLetterSize(key: RangeKey, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const value = clamp(Number(input.value), 0.2, 3);
		if (!Number.isFinite(value)) return;
		if (key === 'minGlyphScale') {
			backgroundState.config.minGlyphScale = Math.min(value, backgroundState.config.maxGlyphScale);
			backgroundState.notifyConfigChanged('minGlyphScale');
		} else if (key === 'maxGlyphScale') {
			backgroundState.config.maxGlyphScale = Math.max(value, backgroundState.config.minGlyphScale);
			backgroundState.notifyConfigChanged('maxGlyphScale');
		}
	}

	function updateOpacity(index: 0 | 1, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const next = [...backgroundState.config.glyphOpacity] as [number, number];
		next[index] = clamp(Number(input.value), 0.02, 0.9);
		if (next[0] > next[1]) next[index === 0 ? 1 : 0] = next[index];
		backgroundState.config.glyphOpacity = next;
		backgroundState.notifyConfigChanged('glyphOpacity');
	}

	function updateFlameDuration(index: 0 | 1, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const next = [...backgroundState.config.smokeTtlMs] as [number, number];
		next[index] = clamp(Number(input.value), 150, 2600);
		if (next[0] > next[1]) next[index === 0 ? 1 : 0] = next[index];
		backgroundState.config.smokeTtlMs = next;
		backgroundState.notifyConfigChanged('smokeTtlMs');
	}

	function randomDirection(): void {
		const value = Math.floor(Math.random() * 24) * 15;
		directionDegrees = value;
		backgroundState.triggerDirectionChange(degreesToRadians(value));
	}

	function randomSpacing(): void {
		backgroundState.triggerSpacingChange();
	}

	function uniqueSpacingOptions(value: number, options: number[]): number[] {
		return [...new Set([...options, Math.round(value)])].sort((a, b) => a - b);
	}

	function display(control: NumberControl): string {
		const value = configValue(control.key);
		return control.format?.(value) ?? `${value}`;
	}

	function closePanel(): void {
		backgroundState.backgroundConfig(false);
	}
</script>

{#if backgroundState.configOpen}
	<aside class="debug-config-panel" aria-label="DEBUG backgroundConfig">
		<header class="debug-config-header">
			<strong>Background</strong>
			<button type="button" aria-label="Close background config" onclick={closePanel}>Close</button>
		</header>

		<div class="debug-config-actions">
			<button type="button" onclick={randomDirection}>Random Direction</button>
			<button type="button" onclick={randomSpacing}>Random Spacing</button>
		</div>

		<label class="debug-config-row">
			<span>Direction</span>
			<input
				type="range"
				aria-label="Direction"
				min="0"
				max="345"
				step="15"
				value={directionDegrees}
				oninput={updateDirection}
			/>
			<input
				type="number"
				aria-label="Direction degrees"
				min="0"
				max="345"
				step="15"
				value={directionDegrees}
				oninput={updateDirection}
			/>
		</label>

		{#each numberControls as control}
			<label class="debug-config-row">
				<span>{control.label}</span>
				<input
					type="range"
					aria-label={control.label}
					min={control.min}
					max={control.max}
					step={control.step}
					value={configValue(control.key)}
					oninput={event => updateNumber(control, event)}
				/>
				<output>{display(control)}</output>
			</label>
		{/each}

		<label class="debug-config-row">
			<span>Antialias</span>
			<input
				type="checkbox"
				aria-label="Antialias"
				checked={backgroundState.config.antialias}
				onchange={event => updateBoolean('antialias', event)}
			/>
			<output>{backgroundState.config.antialias ? 'on' : 'off'}</output>
		</label>

		<div class="debug-config-range">
			<span>Letter Size</span>
			<label>
				<em>min</em>
				<input
					type="range"
					aria-label="Minimum letter size"
					min="0.2"
					max="3"
					step="0.02"
					value={backgroundState.config.minGlyphScale}
					oninput={event => updateLetterSize('minGlyphScale', event)}
				/>
				<output>{backgroundState.config.minGlyphScale.toFixed(2)}x</output>
			</label>
			<label>
				<em>max</em>
				<input
					type="range"
					aria-label="Maximum letter size"
					min="0.2"
					max="3"
					step="0.02"
					value={backgroundState.config.maxGlyphScale}
					oninput={event => updateLetterSize('maxGlyphScale', event)}
				/>
				<output>{backgroundState.config.maxGlyphScale.toFixed(2)}x</output>
			</label>
		</div>

		<div class="debug-config-range">
			<span>Opacity</span>
			<label>
				<em>min</em>
				<input
					type="range"
					aria-label="Minimum opacity"
					min="0.02"
					max="0.9"
					step="0.01"
					value={backgroundState.config.glyphOpacity[0]}
					oninput={event => updateOpacity(0, event)}
				/>
				<output>{Math.round(backgroundState.config.glyphOpacity[0] * 100)}%</output>
			</label>
			<label>
				<em>max</em>
				<input
					type="range"
					aria-label="Maximum opacity"
					min="0.02"
					max="0.9"
					step="0.01"
					value={backgroundState.config.glyphOpacity[1]}
					oninput={event => updateOpacity(1, event)}
				/>
				<output>{Math.round(backgroundState.config.glyphOpacity[1] * 100)}%</output>
			</label>
		</div>

		<div class="debug-config-range">
			<span>Flame Duration</span>
			<label>
				<em>min</em>
				<input
					type="range"
					aria-label="Minimum flame duration"
					min="150"
					max="2600"
					step="50"
					value={backgroundState.config.smokeTtlMs[0]}
					oninput={event => updateFlameDuration(0, event)}
				/>
				<output>{Math.round(backgroundState.config.smokeTtlMs[0])}ms</output>
			</label>
			<label>
				<em>max</em>
				<input
					type="range"
					aria-label="Maximum flame duration"
					min="150"
					max="2600"
					step="50"
					value={backgroundState.config.smokeTtlMs[1]}
					oninput={event => updateFlameDuration(1, event)}
				/>
				<output>{Math.round(backgroundState.config.smokeTtlMs[1])}ms</output>
			</label>
		</div>
	</aside>
{/if}

<style>
	.debug-config-panel {
		position: fixed;
		top: 0.75rem;
		right: 0.75rem;
		z-index: 4;
		display: grid;
		gap: 0.6rem;
		width: min(23rem, calc(100vw - 1.5rem));
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

	.debug-config-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.debug-config-row,
	.debug-config-range label {
		display: grid;
		grid-template-columns: 6.8rem minmax(5rem, 1fr) 4rem;
		align-items: center;
		gap: 0.45rem;
	}

	.debug-config-range {
		display: grid;
		gap: 0.3rem;
		border-top: 1px solid color-mix(in oklab, var(--app-border) 64%, transparent);
		padding-top: 0.55rem;
	}

	.debug-config-row > span,
	.debug-config-range > span {
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

	.debug-config-panel button {
		border: 1px solid color-mix(in oklab, var(--app-border) 82%, transparent);
		border-radius: 0.375rem;
		background: var(--app-input);
		color: var(--app-text);
		cursor: pointer;
		font: inherit;
		font-weight: 800;
		padding: 0.28rem 0.45rem;
	}

	.debug-config-panel button:hover {
		background: color-mix(in oklab, var(--app-accent) 24%, var(--app-input));
	}

	.debug-config-panel input {
		min-width: 0;
		accent-color: var(--app-accent);
	}

	.debug-config-panel input[type='number'] {
		width: 100%;
		border: 1px solid var(--app-border);
		border-radius: 0.375rem;
		background: var(--app-input);
		color: var(--app-text);
		font: inherit;
		padding: 0.25rem 0.35rem;
	}

	.debug-config-panel output {
		color: var(--app-text);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-align: right;
	}

	@media (max-width: 420px) {
		.debug-config-panel {
			top: 0.4rem;
			right: 0.4rem;
			width: calc(100vw - 0.8rem);
			max-height: 56dvh;
		}

		.debug-config-row,
		.debug-config-range label {
			grid-template-columns: 1fr;
		}

		.debug-config-panel output {
			text-align: left;
		}
	}
</style>
