<script lang="ts">
	import { BackgroundState } from '$lib/backgroundState.svelte';
	import { type EngineCell, LetterGridEngine } from '$lib/letterGridEngine';
	import { onMount } from 'svelte';

	type Atlas = {
		texture: WebGLTexture;
		entries: Map<string, [number, number, number, number]>;
		key: string;
	};
	type GlyphProgram = {
		program: WebGLProgram;
		resolution: WebGLUniformLocation | null;
		pixelRatio: WebGLUniformLocation | null;
		gridShift: WebGLUniformLocation | null;
		spacing: WebGLUniformLocation | null;
		time: WebGLUniformLocation | null;
		displayAngle: WebGLUniformLocation | null;
		spinEnabled: WebGLUniformLocation | null;
		spinMultiplier: WebGLUniformLocation | null;
		color: WebGLUniformLocation | null;
	};
	type SmokeProgram = {
		program: WebGLProgram;
		resolution: WebGLUniformLocation | null;
		pixelRatio: WebGLUniformLocation | null;
		gridShift: WebGLUniformLocation | null;
		spacing: WebGLUniformLocation | null;
		time: WebGLUniformLocation | null;
		color: WebGLUniformLocation | null;
		count: WebGLUniformLocation | null;
		smokeA: WebGLUniformLocation | null;
		smokeB: WebGLUniformLocation | null;
		smokeC: WebGLUniformLocation | null;
	};
	type ThemeColors = {
		text: [number, number, number, number];
		smoke: [number, number, number, number];
	};

	const instanceFloats = 16;
	const instanceStride = instanceFloats * Float32Array.BYTES_PER_ELEMENT;
	const maxSmokeBursts = 32;
	const quadData = new Float32Array([
		-0.5, -0.5, 0, 0, 0.5, -0.5, 1, 0, 0.5, 0.5, 1, 1, -0.5, -0.5, 0, 0, 0.5, 0.5, 1, 1, -0.5, 0.5, 0, 1,
	]);
	const fullscreenData = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);

	let { state: backgroundState }: { state: BackgroundState } = $props();
	let canvas: HTMLCanvasElement | undefined = undefined;
	// svelte-ignore state_referenced_locally
	const engine = new LetterGridEngine(backgroundState);

	onMount(() => {
		if (!canvas) return;
		backgroundState.resetMetrics('webgl');

		const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
		const instanced = gl?.getExtension('ANGLE_instanced_arrays');
		if (!gl || !instanced) return;

		const glyphProgram = createGlyphProgram(gl);
		const smokeProgram = createSmokeProgram(gl);
		const quadBuffer = createStaticBuffer(gl, quadData);
		const instanceBuffer = gl.createBuffer();
		const fullscreenBuffer = createStaticBuffer(gl, fullscreenData);
		if (!instanceBuffer) return;

		let frame = 0;
		let lastFrame = 0;
		let uploadedRevision = -1;
		let instanceCount = 0;
		let atlas: Atlas | undefined;
		let colors = readThemeColors();
		let smokeA = new Float32Array(maxSmokeBursts * 4);
		let smokeB = new Float32Array(maxSmokeBursts * 4);
		let smokeC = new Float32Array(maxSmokeBursts * 4);
		const resize = () => resizeCanvas(canvas!, gl);
		const themeObserver = new MutationObserver(() => (colors = readThemeColors()));
		const stopActions = backgroundState.onAction(action => {
			engine.handleAction(action, window.innerWidth, window.innerHeight);
			if (action.type === 'config' && (action.key === 'glyphs' || action.key === 'specialGlyphs')) {
				if (atlas) gl.deleteTexture(atlas.texture);
				atlas = undefined;
				uploadedRevision = -1;
			}
		});

		resize();
		window.addEventListener('resize', resize);
		themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		const tick = (now: number) => {
			const frameMs = lastFrame === 0 ? 0 : now - lastFrame;
			lastFrame = now;

			const updateStartedAt = performance.now();
			engine.update(now, window.innerWidth, window.innerHeight);
			atlas = ensureAtlas(gl, atlas);
			if (uploadedRevision !== engine.revision) {
				instanceCount = uploadInstances(gl, instanceBuffer, atlas);
				uploadedRevision = engine.revision;
			}

			const drawStartedAt = performance.now();
			drawGlyphs(gl, instanced, glyphProgram, quadBuffer, instanceBuffer, atlas, instanceCount, colors.text, now);
			drawSmoke(gl, smokeProgram, fullscreenBuffer, smokeA, smokeB, smokeC, colors.smoke, now);
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
			themeObserver.disconnect();
			window.cancelAnimationFrame(frame);
			window.removeEventListener('resize', resize);
			if (atlas) gl.deleteTexture(atlas.texture);
			gl.deleteBuffer(quadBuffer);
			gl.deleteBuffer(instanceBuffer);
			gl.deleteBuffer(fullscreenBuffer);
			gl.deleteProgram(glyphProgram.program);
			gl.deleteProgram(smokeProgram.program);
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

	function createStaticBuffer(gl: WebGLRenderingContext, data: Float32Array): WebGLBuffer {
		const buffer = gl.createBuffer();
		if (!buffer) throw new Error('Unable to create background buffer');
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		return buffer;
	}

	function ensureAtlas(gl: WebGLRenderingContext, atlas: Atlas | undefined): Atlas {
		const chars = uniqueChars([...backgroundState.config.glyphs, ...backgroundState.config.specialGlyphs]);
		const key = chars.join('');
		if (atlas?.key === key) return atlas;
		if (atlas) gl.deleteTexture(atlas.texture);

		const cellSize = 96;
		const count = chars.length;
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
		context.font = `800 64px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace'}`;

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

		const texture = gl.createTexture();
		if (!texture) throw new Error('Unable to create background atlas texture');
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		return { texture, entries, key };
	}

	function uploadInstances(gl: WebGLRenderingContext, buffer: WebGLBuffer, atlas: Atlas): number {
		const data = new Float32Array(engine.cells.length * instanceFloats);
		const fallbackUv: [number, number, number, number] = atlas.entries.values().next().value ?? [0, 0, 1, 1];
		for (let index = 0; index < engine.cells.length; index += 1) {
			const cell = engine.cells[index];
			const uv = atlas.entries.get(cell.char) ?? fallbackUv;
			const offset = index * instanceFloats;
			const spinSpeed = ((Math.PI * 2) / cell.spinDuration) * cell.spinDirection;
			data[offset] = cell.column;
			data[offset + 1] = cell.row;
			data[offset + 2] = cellStatus(cell);
			data[offset + 3] = cell.opacity;
			data[offset + 4] = uv[0];
			data[offset + 5] = uv[1];
			data[offset + 6] = uv[2];
			data[offset + 7] = uv[3];
			data[offset + 8] = cell.scale;
			data[offset + 9] = spinSpeed;
			data[offset + 10] = cell.spinDelay * spinSpeed;
			data[offset + 11] = 0;
			data[offset + 12] = cell.spawnStartedAt;
			data[offset + 13] = cell.spawnMs;
			data[offset + 14] = cell.deathStartedAt;
			data[offset + 15] = cell.decayMs;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
		return engine.cells.length;
	}

	function drawGlyphs(
		gl: WebGLRenderingContext,
		instanced: ANGLE_instanced_arrays,
		glyphProgram: GlyphProgram,
		quadBuffer: WebGLBuffer,
		instanceBuffer: WebGLBuffer,
		atlas: Atlas,
		instanceCount: number,
		color: [number, number, number, number],
		now: number,
	): void {
		const ratio = window.devicePixelRatio || 1;
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(glyphProgram.program);
		setupGlyphAttributes(gl, instanced, quadBuffer, instanceBuffer);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
		gl.uniform2f(glyphProgram.resolution, window.innerWidth * ratio, window.innerHeight * ratio);
		gl.uniform1f(glyphProgram.pixelRatio, ratio);
		gl.uniform2f(glyphProgram.gridShift, engine.gridShiftX, engine.gridShiftY);
		gl.uniform1f(glyphProgram.spacing, engine.spacing.current);
		gl.uniform1f(glyphProgram.time, now);
		gl.uniform1f(glyphProgram.displayAngle, engine.direction.displayAngle);
		gl.uniform1f(glyphProgram.spinEnabled, engine.direction.phase === 'cruise' ? 1 : 0);
		gl.uniform1f(glyphProgram.spinMultiplier, backgroundState.config.spinSpeedMultiplier);
		gl.uniform4f(glyphProgram.color, color[0], color[1], color[2], color[3]);
		instanced.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, instanceCount);
	}

	function drawSmoke(
		gl: WebGLRenderingContext,
		smokeProgram: SmokeProgram,
		fullscreenBuffer: WebGLBuffer,
		smokeA: Float32Array,
		smokeB: Float32Array,
		smokeC: Float32Array,
		color: [number, number, number, number],
		now: number,
	): void {
		const active = engine.puffs.slice(-maxSmokeBursts);
		if (active.length === 0) return;

		smokeA.fill(0);
		smokeB.fill(0);
		smokeC.fill(0);
		for (let index = 0; index < active.length; index += 1) {
			const puff = active[index];
			const offset = index * 4;
			smokeA[offset] = puff.x;
			smokeA[offset + 1] = puff.y;
			smokeA[offset + 2] = puff.dx;
			smokeA[offset + 3] = puff.dy;
			smokeB[offset] = puff.createdAt;
			smokeB[offset + 1] = puff.ttl;
			smokeB[offset + 2] = puff.scale;
			smokeB[offset + 3] = puff.endScale;
			smokeC[offset] = puff.opacity;
			smokeC[offset + 1] = (puff.rotation * Math.PI) / 180;
			smokeC[offset + 2] = (puff.endRotation * Math.PI) / 180;
			smokeC[offset + 3] = puff.screenLocked ? -puff.id : puff.id;
		}

		const ratio = window.devicePixelRatio || 1;
		gl.useProgram(smokeProgram.program);
		setupSmokeAttributes(gl, fullscreenBuffer);
		gl.uniform2f(smokeProgram.resolution, window.innerWidth * ratio, window.innerHeight * ratio);
		gl.uniform1f(smokeProgram.pixelRatio, ratio);
		gl.uniform2f(smokeProgram.gridShift, engine.gridShiftX, engine.gridShiftY);
		gl.uniform1f(smokeProgram.spacing, engine.spacing.current);
		gl.uniform1f(smokeProgram.time, now);
		gl.uniform4f(smokeProgram.color, color[0], color[1], color[2], color[3]);
		gl.uniform1i(smokeProgram.count, active.length);
		gl.uniform4fv(smokeProgram.smokeA, smokeA);
		gl.uniform4fv(smokeProgram.smokeB, smokeB);
		gl.uniform4fv(smokeProgram.smokeC, smokeC);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}

	function setupGlyphAttributes(
		gl: WebGLRenderingContext,
		instanced: ANGLE_instanced_arrays,
		quadBuffer: WebGLBuffer,
		instanceBuffer: WebGLBuffer,
	): void {
		gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
		gl.enableVertexAttribArray(0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
		instanced.vertexAttribDivisorANGLE(0, 0);
		instanced.vertexAttribDivisorANGLE(1, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
		for (let location = 2; location <= 7; location += 1) gl.enableVertexAttribArray(location);
		gl.vertexAttribPointer(2, 2, gl.FLOAT, false, instanceStride, 0);
		gl.vertexAttribPointer(3, 1, gl.FLOAT, false, instanceStride, 8);
		gl.vertexAttribPointer(4, 1, gl.FLOAT, false, instanceStride, 12);
		gl.vertexAttribPointer(5, 4, gl.FLOAT, false, instanceStride, 16);
		gl.vertexAttribPointer(6, 4, gl.FLOAT, false, instanceStride, 32);
		gl.vertexAttribPointer(7, 4, gl.FLOAT, false, instanceStride, 48);
		for (let location = 2; location <= 7; location += 1) instanced.vertexAttribDivisorANGLE(location, 1);
	}

	function setupSmokeAttributes(gl: WebGLRenderingContext, fullscreenBuffer: WebGLBuffer): void {
		for (let location = 1; location <= 7; location += 1) gl.disableVertexAttribArray(location);
		gl.bindBuffer(gl.ARRAY_BUFFER, fullscreenBuffer);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
	}

	function createGlyphProgram(gl: WebGLRenderingContext): GlyphProgram {
		const program = createProgram(
			gl,
			`
				attribute vec2 a_corner;
				attribute vec2 a_unitUv;
				attribute vec2 a_grid;
				attribute float a_status;
				attribute float a_opacity;
				attribute vec4 a_uvRect;
				attribute vec4 a_style;
				attribute vec4 a_life;
				uniform vec2 u_resolution;
				uniform float u_pixelRatio;
				uniform vec2 u_gridShift;
				uniform float u_spacing;
				uniform float u_time;
				uniform float u_displayAngle;
				uniform float u_spinEnabled;
				uniform float u_spinMultiplier;
				varying vec2 v_uv;
				varying float v_alpha;

				float smooth01(float value) {
					float progress = clamp(value, 0.0, 1.0);
					return progress * progress * (3.0 - 2.0 * progress);
				}

				void main() {
					float scale = a_style.x;
					float alpha = a_opacity;
					if (a_status < 0.5) {
						alpha = 0.0;
						scale = 0.0;
					} else if (a_status > 1.5 && a_status < 2.5) {
						float progress = smooth01((u_time - a_life.x) / max(1.0, a_life.y));
						alpha *= progress;
						scale *= 0.28 + progress * 0.72;
					} else if (a_status > 2.5) {
						float progress = smooth01((u_time - a_life.z) / max(1.0, a_life.w));
						alpha *= 1.0 - progress;
						scale *= 1.0 - progress * 0.76;
					}

					float size = u_spacing * max(0.8, scale) * 0.78 * u_pixelRatio * step(0.001, alpha);
					float rotation = u_displayAngle + u_spinEnabled * u_spinMultiplier * (u_time * a_style.y + a_style.z);
					float cosRotation = cos(rotation);
					float sinRotation = sin(rotation);
					vec2 corner = vec2(
						a_corner.x * cosRotation - a_corner.y * sinRotation,
						a_corner.x * sinRotation + a_corner.y * cosRotation
					);
					vec2 center = (u_gridShift + (a_grid + 0.5) * u_spacing) * u_pixelRatio;
					vec2 zeroToOne = (center + corner * size) / u_resolution;
					vec2 clip = zeroToOne * 2.0 - 1.0;
					gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
					v_uv = mix(a_uvRect.xy, a_uvRect.zw, a_unitUv);
					v_alpha = alpha;
				}
			`,
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
			['a_corner', 'a_unitUv', 'a_grid', 'a_status', 'a_opacity', 'a_uvRect', 'a_style', 'a_life'],
		);
		return {
			program,
			resolution: gl.getUniformLocation(program, 'u_resolution'),
			pixelRatio: gl.getUniformLocation(program, 'u_pixelRatio'),
			gridShift: gl.getUniformLocation(program, 'u_gridShift'),
			spacing: gl.getUniformLocation(program, 'u_spacing'),
			time: gl.getUniformLocation(program, 'u_time'),
			displayAngle: gl.getUniformLocation(program, 'u_displayAngle'),
			spinEnabled: gl.getUniformLocation(program, 'u_spinEnabled'),
			spinMultiplier: gl.getUniformLocation(program, 'u_spinMultiplier'),
			color: gl.getUniformLocation(program, 'u_color'),
		};
	}

	function createSmokeProgram(gl: WebGLRenderingContext): SmokeProgram {
		const program = createProgram(
			gl,
			`
				attribute vec2 a_position;
				uniform vec2 u_resolution;
				varying vec2 v_screen;

				void main() {
					v_screen = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5) * u_resolution;
					gl_Position = vec4(a_position, 0.0, 1.0);
				}
			`,
			`
				precision highp float;
				#define MAX_SMOKE 32
				uniform vec2 u_resolution;
				uniform float u_pixelRatio;
				uniform vec2 u_gridShift;
				uniform float u_spacing;
				uniform float u_time;
				uniform vec4 u_color;
				uniform int u_smokeCount;
				uniform vec4 u_smokeA[MAX_SMOKE];
				uniform vec4 u_smokeB[MAX_SMOKE];
				uniform vec4 u_smokeC[MAX_SMOKE];
				varying vec2 v_screen;

				float smooth01(float value) {
					float progress = clamp(value, 0.0, 1.0);
					return progress * progress * (3.0 - 2.0 * progress);
				}

				float hash(vec2 value) {
					return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
				}

				float smokeLobe(vec2 value, vec2 offset, float tightness) {
					vec2 point = value - offset;
					return exp(-dot(point, point) * tightness);
				}

				void main() {
					float alpha = 0.0;
					for (int index = 0; index < MAX_SMOKE; index++) {
						if (index >= u_smokeCount) break;
						vec4 smokeA = u_smokeA[index];
						vec4 smokeB = u_smokeB[index];
						vec4 smokeC = u_smokeC[index];
						float progress = clamp((u_time - smokeB.x) / max(1.0, smokeB.y), 0.0, 1.0);
						float eased = smooth01(progress);
						float fade = sin(3.14159265359 * progress);
						float locked = step(smokeC.w, 0.0);
						vec2 base = mix(u_gridShift + smokeA.xy, smokeA.xy, locked);
						vec2 center = (base + smokeA.zw * eased) * u_pixelRatio;
						float radius = max(1.0, u_spacing * mix(smokeB.z, smokeB.w, eased) * 0.52 * u_pixelRatio);
						float rotation = smokeC.y + smokeC.z * eased;
						float cosRotation = cos(rotation);
						float sinRotation = sin(rotation);
						vec2 delta = (v_screen - center) / radius;
						vec2 warped = vec2(
							delta.x * cosRotation - delta.y * sinRotation,
							delta.x * sinRotation + delta.y * cosRotation
						);
						float grain = 0.86 + 0.14 * hash(floor(v_screen / 3.0) + vec2(float(index), abs(smokeC.w)));
						float body =
							smokeLobe(warped, vec2(0.0, 0.0), 2.1) * 0.72 +
							smokeLobe(warped, vec2(0.34, 0.12), 5.2) * 0.18 +
							smokeLobe(warped, vec2(-0.28, -0.16), 4.4) * 0.14;
						alpha += smokeC.x * fade * body * grain;
					}
					gl_FragColor = vec4(u_color.rgb, u_color.a * clamp(alpha, 0.0, 0.68));
				}
			`,
			['a_position'],
		);
		return {
			program,
			resolution: gl.getUniformLocation(program, 'u_resolution'),
			pixelRatio: gl.getUniformLocation(program, 'u_pixelRatio'),
			gridShift: gl.getUniformLocation(program, 'u_gridShift'),
			spacing: gl.getUniformLocation(program, 'u_spacing'),
			time: gl.getUniformLocation(program, 'u_time'),
			color: gl.getUniformLocation(program, 'u_color'),
			count: gl.getUniformLocation(program, 'u_smokeCount'),
			smokeA: gl.getUniformLocation(program, 'u_smokeA[0]'),
			smokeB: gl.getUniformLocation(program, 'u_smokeB[0]'),
			smokeC: gl.getUniformLocation(program, 'u_smokeC[0]'),
		};
	}

	function createProgram(
		gl: WebGLRenderingContext,
		vertexSource: string,
		fragmentSource: string,
		attributes: string[],
	): WebGLProgram {
		const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
		const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
		const program = gl.createProgram();
		if (!program) throw new Error('Unable to create WebGL program');
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		attributes.forEach((attribute, index) => gl.bindAttribLocation(program, index, attribute));
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

	function cellStatus(cell: EngineCell): number {
		if (cell.status === 'alive') return 1;
		if (cell.status === 'spawning') return 2;
		if (cell.status === 'dying') return 3;
		return 0;
	}

	function readThemeColors(): ThemeColors {
		return {
			text: cssColor('--app-muted'),
			smoke: cssColor('--app-accent-strong'),
		};
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
