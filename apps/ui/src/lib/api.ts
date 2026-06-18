import type { AppRouterClient } from '@repo/shared/rpc';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

export const api = createORPCClient<AppRouterClient>(
	new RPCLink({
		url: () => new URL('/api/rpc', typeof location === 'undefined' ? 'http://localhost' : location.origin),
	}),
);
