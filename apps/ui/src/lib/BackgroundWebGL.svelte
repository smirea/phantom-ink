<script lang="ts">
	import { BackgroundState } from '$lib/backgroundState.svelte';
	import { LetterGridEngine } from '$lib/letterGridEngine';
	import { onMount } from 'svelte';

	type Atlas = {
		texture: WebGLTexture;
		entries: Map<string, [number, number, number, number]>;
		smoke: [number, number, number, number];
		key: string;
	};

	let { state: backgroundState }: { state: BackgroundState } = $props();
	let canvas: HTMLCanvasElement | undefined = undefined;
	// svelte-ignore state_referenced_locally
	const engine = new LetterGridEngine(backgroundState);

	onMount(() => {
		if (!canvas) return;
		backgroundState.resetMetrics('webgl');
		const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
		if (!gl) return;

		const program = createProgram(gl);
		const positionLocation = gl.getAttribLocation(program, 'a_position');
		const uvLocation = gl.getAttribLocation(program, 'a_uv');
		const alphaLocation = gl.getAttribLocation(program, 'a_alpha');
		const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
		const colorLocation = gl.getUniformLocation(program, 'u_color');
		const buffer = gl.createBuffer();
		let frame = 0;
		let atlas: Atlas | undefined;
		const stopActions = backgroundState.onAction(action => {
			engine.handleAction(action, window.innerWidth, window.innerHeight);
			if (action.type === 'config' && (action.key === 'glyphs' || action.key === 'specialGlyphs')) {
				if (atlas) gl.deleteTexture(atlas.texture);
				atlas = undefined;
			}
		});

		const resize = () => resizeCanvas(canvas!, gl);
		let lastFrame = 0;
		resize();
		window.addEventListener('resize', resize);

		gl.useProgram(program);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.enableVertexAttribArray(positionLocation);
		gl.enableVertexAttribArray(uvLocation);
		gl.enableVertexAttribArray(alphaLocation);
		gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 20, 0);
		gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 20, 8);
		gl.vertexAttribPointer(alphaLocation, 1, gl.FLOAT, false, 20, 16);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		const tick = (now: number) => {
			const frameMs = lastFrame === 0 ? 0 : now - lastFrame;
			lastFrame = now;
			const updateStartedAt = performance.now();
			engine.update(now, window.innerWidth, window.innerHeight);
			const drawStartedAt = performance.now();
			atlas = ensureAtlas(gl, atlas);
			draw(gl, atlas, now, buffer!, resolutionLocation, colorLocation);
			const finishedAt = performance.now();
			backgroundState.recordFrame(
				'webgl',
				frameMs,
				drawStartedAt - updateStartedAt,
				finishedAt - drawStartedAt,
				engine.cells.length,
				engine.puffs.length,
				now,
			);
			frame = window.requestAnimationFrame(tick);
		};
		frame = window.requestAnimationFrame(tick);

		return () => {
			stopActions();
			window.removeEventListener('resize', resize);
			window.cancelAnimationFrame(frame);
			if (atlas) gl.deleteTexture(atlas.texture);
			if (buffer) gl.deleteBuffer(buffer);
			gl.deleteProgram(program);
		};
	});

	function resizeCanvas(target: HTMLCanvasElement, gl: WebGLRenderingContext): void {
		const ratio = window.devicePixelRatio || 1;
		const width = window.innerWidth;
		const height = window.innerHeight;
		target.width = Math.ceil(width * ratio);
		target.height = Math.ceil(height * ratio);
		target.style.width = `${width}px`;
		target.style.height = `${height}px`;
		gl.viewport(0, 0, target.width, target.height);
	}

	function ensureAtlas(gl: WebGLRenderingContext, atlas: Atlas | undefined): Atlas {
		const chars = uniqueChars([...backgroundState.config.glyphs, ...backgroundState.config.specialGlyphs]);
		const key = chars.join('');
		if (atlas?.key === key) return atlas;
		if (atlas) gl.deleteTexture(atlas.texture);

		const cellSize = 64;
		const count = chars.length + 1;
		const columns = Math.ceil(Math.sqrt(count));
		const rows = Math.ceil(count / columns);
		const source = document.createElement('canvas');
		source.width = columns * cellSize;
		source.height = rows * cellSize;
		const context = source.getContext('2d')!;
		context.clearRect(0, 0, source.width, source.height);
		context.fillStyle = 'white';
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.font = `800 44px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace'}`;

		const entries = new Map<string, [number, number, number, number]>();
		chars.forEach((char, index) => {
			const column = index % columns;
			const row = Math.floor(index / columns);
			const x = column * cellSize;
			const y = row * cellSize;
			context.fillText(char, x + cellSize / 2, y + cellSize / 2 + 1);
			entries.set(char, [
				x / source.width,
				y / source.height,
				(x + cellSize) / source.width,
				(y + cellSize) / source.height,
			]);
		});

		const smokeIndex = chars.length;
		const smokeColumn = smokeIndex % columns;
		const smokeRow = Math.floor(smokeIndex / columns);
		const smokeX = smokeColumn * cellSize;
		const smokeY = smokeRow * cellSize;
		const gradient = context.createRadialGradient(
			smokeX + cellSize / 2,
			smokeY + cellSize / 2,
			0,
			smokeX + cellSize / 2,
			smokeY + cellSize / 2,
			cellSize / 2,
		);
		gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
		gradient.addColorStop(0.45, 'rgba(255,255,255,0.45)');
		gradient.addColorStop(1, 'rgba(255,255,255,0)');
		context.fillStyle = gradient;
		context.fillRect(smokeX, smokeY, cellSize, cellSize);
		const smoke: [number, number, number, number] = [
			smokeX / source.width,
			smokeY / source.height,
			(smokeX + cellSize) / source.width,
			(smokeY + cellSize) / source.height,
		];

		const texture = gl.createTexture();
		if (!texture) throw new Error('Unable to create background atlas texture');
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		return { texture, entries, smoke, key };
	}

	function draw(
		gl: WebGLRenderingContext,
		atlas: Atlas,
		now: number,
		buffer: WebGLBuffer,
		resolutionLocation: WebGLUniformLocation | null,
		colorLocation: WebGLUniformLocation | null,
	): void {
		const ratio = window.devicePixelRatio || 1;
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.uniform2f(resolutionLocation, window.innerWidth * ratio, window.innerHeight * ratio);
		gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

		const textVertices: number[] = [];
		for (const cell of engine.cells) {
			if (cell.status === 'dead') continue;
			const visual = engine.cellVisual(cell, now);
			if (visual.alpha <= 0.001) continue;
			pushQuad(
				textVertices,
				visual.x * ratio,
				visual.y * ratio,
				visual.pointSize * ratio * 0.78,
				visual.spin,
				atlas.entries.get(cell.char) ?? atlas.entries.get('P')!,
				visual.alpha,
			);
		}
		drawVertices(gl, textVertices, colorLocation, cssColor('--app-muted'));

		const puffVertices: number[] = [];
		for (const puff of engine.puffs) {
			const visual = engine.puffVisual(puff, now);
			if (visual.alpha <= 0.001) continue;
			pushQuad(
				puffVertices,
				visual.x * ratio,
				visual.y * ratio,
				visual.pointSize * ratio * 0.46,
				(visual.rotation * Math.PI) / 180,
				atlas.smoke,
				visual.alpha,
			);
		}
		drawVertices(gl, puffVertices, colorLocation, cssColor('--app-accent-strong'));
	}

	function drawVertices(
		gl: WebGLRenderingContext,
		vertices: number[],
		colorLocation: WebGLUniformLocation | null,
		color: [number, number, number, number],
	): void {
		if (vertices.length === 0) return;
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
		gl.uniform4f(colorLocation, color[0], color[1], color[2], color[3]);
		gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 5);
	}

	function pushQuad(
		vertices: number[],
		x: number,
		y: number,
		size: number,
		rotation: number,
		uv: [number, number, number, number],
		alpha: number,
	): void {
		const half = size / 2;
		const corners = [
			[-half, -half, uv[0], uv[1]],
			[half, -half, uv[2], uv[1]],
			[half, half, uv[2], uv[3]],
			[-half, -half, uv[0], uv[1]],
			[half, half, uv[2], uv[3]],
			[-half, half, uv[0], uv[3]],
		];
		const cos = Math.cos(rotation);
		const sin = Math.sin(rotation);
		for (const [cornerX, cornerY, u, v] of corners) {
			vertices.push(x + cornerX * cos - cornerY * sin, y + cornerX * sin + cornerY * cos, u, v, alpha);
		}
	}

	function createProgram(gl: WebGLRenderingContext): WebGLProgram {
		const vertex = compileShader(
			gl,
			gl.VERTEX_SHADER,
			`
				attribute vec2 a_position;
				attribute vec2 a_uv;
				attribute float a_alpha;
				uniform vec2 u_resolution;
				varying vec2 v_uv;
				varying float v_alpha;
				void main() {
					vec2 zeroToOne = a_position / u_resolution;
					vec2 clip = zeroToOne * 2.0 - 1.0;
					gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
					v_uv = a_uv;
					v_alpha = a_alpha;
				}
			`,
		);
		const fragment = compileShader(
			gl,
			gl.FRAGMENT_SHADER,
			`
				precision mediump float;
				uniform sampler2D u_texture;
				uniform vec4 u_color;
				varying vec2 v_uv;
				varying float v_alpha;
				void main() {
					vec4 sample = texture2D(u_texture, v_uv);
					gl_FragColor = vec4(u_color.rgb, u_color.a * v_alpha * sample.a);
				}
			`,
		);
		const program = gl.createProgram();
		if (!program) throw new Error('Unable to create WebGL program');
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS))
			throw new Error(gl.getProgramInfoLog(program) ?? 'WebGL link failed');
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
		return program;
	}

	function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
		const shader = gl.createShader(type);
		if (!shader) throw new Error('Unable to create WebGL shader');
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
			throw new Error(gl.getShaderInfoLog(shader) ?? 'WebGL compile failed');
		return shader;
	}

	function cssColor(name: string): [number, number, number, number] {
		const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		if (!value.startsWith('#')) return [0.72, 0.67, 0.72, 1];
		const color = Number.parseInt(value.slice(1), 16);
		return [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255, 1];
	}

	function uniqueChars(chars: string[]): string[] {
		return [...new Set(chars.length ? chars : ['P'])];
	}

	function handlePointer(event: PointerEvent): void {
		engine.popAt(event.clientX, event.clientY);
	}
</script>

<canvas
	bind:this={canvas}
	class="webgl-background"
	data-background-renderer="webgl"
	aria-hidden="true"
	onpointerdown={handlePointer}
></canvas>

<style>
	.webgl-background {
		position: fixed;
		inset: 0;
		z-index: 0;
		display: block;
		width: 100vw;
		height: 100vh;
		pointer-events: auto;
	}
</style>
