const debugIdParamNames = ['DEBUG_ID', 'debug_id'] as const;

export function debugIdFromSearch(search: string): string | null {
	return debugIdFromParams(new URLSearchParams(search));
}

export function debugIdFromUrl(url: URL): string | null {
	return debugIdFromParams(url.searchParams);
}

export function hasDebugId(url: URL): boolean {
	return debugIdParamNames.some(name => url.searchParams.has(name));
}

function debugIdFromParams(params: URLSearchParams): string | null {
	for (const name of debugIdParamNames) {
		const value = params.get(name);
		if (value) return value;
	}

	const returnTo = params.get('returnTo');
	if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) return null;

	try {
		const returnUrl = new URL(returnTo, 'http://phantom-ink.localhost');
		return debugIdFromUrl(returnUrl);
	} catch {
		return null;
	}
}
