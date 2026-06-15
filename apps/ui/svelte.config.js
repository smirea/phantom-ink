import adapter from '@sveltejs/adapter-static';

const config = {
	compilerOptions: {
		warningFilter: warning => !warning.code.startsWith('a11y_'),
	},
	kit: {
		adapter: adapter({
			fallback: 'index.html',
		}),
		alias: {
			'@repo/shared': '../../packages/shared/src/index.ts',
			'@repo/shared/*': '../../packages/shared/src/*',
		},
	},
};

export default config;
