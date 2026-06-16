<script lang="ts">
	import {
		type BackgroundState,
		type DebugGlyphListField,
		type DebugNumberField,
		type DebugNumberListField,
		type DebugRangeField,
		type GlyphListConfigKey,
		type NumberListConfigKey,
		clamp,
		formatGlyphList,
		formatNumberList,
		glyphListConfigFields,
		numberConfigFields,
		numberListConfigFields,
		parseGlyphList,
		parseNumberList,
		rangeConfigFields,
		radiansToDegrees,
		uniqueNumbers,
	} from '$lib/backgroundState.svelte';

	let { state: backgroundState }: { state: BackgroundState } = $props();
	// svelte-ignore state_referenced_locally
	let numberListDrafts = $state<Record<NumberListConfigKey, string>>({
		spacingOptions: formatNumberList(backgroundState.config.spacingOptions),
		directionOptions: formatNumberList(backgroundState.config.directionOptions.map(radiansToDegrees)),
	});
	// svelte-ignore state_referenced_locally
	let glyphListDrafts = $state<Record<GlyphListConfigKey, string>>({
		glyphs: formatGlyphList(backgroundState.config.glyphs),
		specialGlyphs: formatGlyphList(backgroundState.config.specialGlyphs),
	});

	function getNumberConfig(key: DebugNumberField['key']): number {
		return backgroundState.config[key];
	}

	function getRangeConfig(key: DebugRangeField['key'], index: 0 | 1): number {
		return backgroundState.config[key][index];
	}

	function updateNumberConfig(field: DebugNumberField, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const rawValue = Number(input.value);
		if (!Number.isFinite(rawValue)) return;

		const nextValue = field.integer ? Math.round(rawValue) : rawValue;
		backgroundState.config[field.key] = clamp(nextValue, field.min, field.max);

		if (field.key === 'minimumGridSpacing') {
			backgroundState.config.initialSpacing = Math.max(
				backgroundState.config.initialSpacing,
				backgroundState.config.minimumGridSpacing,
			);
			backgroundState.config.spacingOptions = backgroundState.config.spacingOptions.filter(
				spacing => spacing >= backgroundState.config.minimumGridSpacing,
			);
			numberListDrafts.spacingOptions = formatNumberList(backgroundState.config.spacingOptions);
		} else if (field.key === 'initialSpacing') {
			backgroundState.config.initialSpacing = Math.max(
				backgroundState.config.initialSpacing,
				backgroundState.config.minimumGridSpacing,
			);
		} else if (field.key === 'minGlyphScale') {
			backgroundState.config.maxGlyphScale = Math.max(
				backgroundState.config.maxGlyphScale,
				backgroundState.config.minGlyphScale,
			);
		} else if (field.key === 'maxGlyphScale') {
			backgroundState.config.minGlyphScale = Math.min(
				backgroundState.config.minGlyphScale,
				backgroundState.config.maxGlyphScale,
			);
		}
		backgroundState.notifyConfigChanged(field.key);
	}

	function updateRangeConfig(field: DebugRangeField, index: 0 | 1, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const rawValue = Number(input.value);
		if (!Number.isFinite(rawValue)) return;

		const nextRange = [...backgroundState.config[field.key]] as [number, number];
		nextRange[index] = clamp(rawValue, field.min, field.max);
		if (nextRange[0] > nextRange[1]) nextRange[index === 0 ? 1 : 0] = nextRange[index];
		backgroundState.config[field.key] = nextRange;
		backgroundState.notifyConfigChanged(field.key);
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
					Math.max(field.min, field.key === 'spacingOptions' ? backgroundState.config.minimumGridSpacing : field.min),
			)
			.filter(value => value <= field.max)
			.map(value => field.convertToConfig?.(value) ?? value);
		if (options.length === 0) return;
		backgroundState.config[field.key] = options;
		backgroundState.notifyConfigChanged(field.key);
	}

	function getGlyphListDraft(key: GlyphListConfigKey): string {
		return glyphListDrafts[key];
	}

	function updateGlyphListConfig(field: DebugGlyphListField, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		glyphListDrafts[field.key] = input.value;
		const glyphs = parseGlyphList(input.value);
		if (glyphs.length === 0) return;
		backgroundState.config[field.key] = glyphs;
		backgroundState.notifyConfigChanged(field.key);
	}
</script>

{#if backgroundState.configOpen}
	<aside class="debug-config-panel" aria-label="DEBUG backgroundConfig">
		<header class="debug-config-header">
			<strong>DEBUG.backgroundConfig()</strong>
			<button
				type="button"
				aria-label="Close background config"
				onclick={() => backgroundState.backgroundConfig(false)}
			>
				Close
			</button>
		</header>

		<div class="debug-config-actions">
			<button type="button" onclick={() => backgroundState.triggerDirectionChange()}>Change Direction</button>
			<button type="button" onclick={() => backgroundState.triggerSpacingChange()}>Change Spacing</button>
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
