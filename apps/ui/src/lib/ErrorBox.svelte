<script lang="ts">
	type ErrorDetails = {
		message: string;
		stack: string;
	};

	let { error, class: cls }: { error: unknown; class?: string } = $props();

	const details = $derived(errorDetails(error));
	const summary = $derived(
		details.message
			.split('\n')
			.find(line => line.trim())
			?.trim() ?? 'Something went wrong',
	);
	const className = $derived(['error-box', cls].filter(Boolean).join(' '));

	function errorDetails(value: unknown): ErrorDetails {
		const serverDetails = readDetails(readRecord(value)?.data);
		if (serverDetails) return serverDetails;

		if (value instanceof Error) {
			return {
				message: value.message,
				stack: value.stack ?? `${value.name}: ${value.message}`,
			};
		}

		const objectDetails = readDetails(value);
		if (objectDetails) return objectDetails;

		const message = formatUnknownError(value);
		return { message, stack: message };
	}

	function readDetails(value: unknown): ErrorDetails | null {
		const record = readRecord(value);
		if (!record || typeof record.message !== 'string') return null;

		return {
			message: record.message,
			stack: typeof record.stack === 'string' ? record.stack : record.message,
		};
	}

	function readRecord(value: unknown): Record<string, unknown> | null {
		return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
	}

	function formatUnknownError(value: unknown): string {
		if (typeof value === 'string') return value;

		try {
			return JSON.stringify(value) ?? String(value);
		} catch {
			return String(value);
		}
	}
</script>

<details class={className}>
	<summary><span>{summary}</span></summary>
	<pre>{details.stack}</pre>
</details>

<style>
	.error-box {
		align-self: start;
		min-width: 0;
		border: 1px solid color-mix(in oklab, var(--app-error) 42%, var(--app-border));
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--app-error-bg) 74%, var(--app-panel));
		color: var(--app-error);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.38;
		overflow: hidden;
		text-align: left;
	}

	.error-box summary {
		cursor: pointer;
		font-weight: 850;
		padding: 0.75rem 0.85rem;
	}

	.error-box summary span {
		display: inline-block;
		max-width: calc(100% - 1.5rem);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		vertical-align: middle;
		white-space: nowrap;
	}

	.error-box pre {
		max-height: min(42dvh, 24rem);
		margin: 0;
		border-top: 1px solid color-mix(in oklab, var(--app-error) 28%, transparent);
		background: color-mix(in oklab, black 14%, transparent);
		overflow: auto;
		padding: 0.85rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
