<script lang="ts">
	import { BackgroundState } from '$lib/backgroundState.svelte';
	import { type EngineCell, LetterGridEngine } from '$lib/letterGridEngine';
	import { onMount } from 'svelte';

	type Atlas = {
		texture: WebGLTexture;
		entries: Map<string, [number, number, number, number]>;
		fallbackUv: [number, number, number, number];
	};
	type GlyphProgram = {
		program: WebGLProgram;
		resolution: WebGLUniformLocation | null;
		pixelRatio: WebGLUniformLocation | null;
		gridShift: WebGLUniformLocation | null;
		spacing: WebGLUniformLocation | null;
		glyphSize: WebGLUniformLocation | null;
		time: WebGLUniformLocation | null;
		displayAngle: WebGLUniformLocation | null;
		spinStartedAt: WebGLUniformLocation | null;
		spinEnabled: WebGLUniformLocation | null;
		spinMultiplier: WebGLUniformLocation | null;
		color: WebGLUniformLocation | null;
	};
	type SmokeProgram = {
		program: WebGLProgram;
		resolution: WebGLUniformLocation | null;
		pixelRatio: WebGLUniformLocation | null;
		gridShift: WebGLUniformLocation | null;
		glyphSize: WebGLUniformLocation | null;
		time: WebGLUniformLocation | null;
		color: WebGLUniformLocation | null;
	};
	type ThemeColors = {
		text: [number, number, number, number];
		smoke: [number, number, number, number];
	};
	type InstanceUploadState = {
		capacity: number;
		count: number;
		data: Float32Array;
	};
	type VertexArrayState = {
		extension: OES_vertex_array_object;
		glyph: WebGLVertexArrayObjectOES;
		smoke: WebGLVertexArrayObjectOES;
	};

	const instanceFloats = 16;
	const instanceStride = instanceFloats * Float32Array.BYTES_PER_ELEMENT;
	const smokeInstanceFloats = 12;
	const smokeInstanceStride = smokeInstanceFloats * Float32Array.BYTES_PER_ELEMENT;
	const maxSmokeBursts = 32;
	const quadData = new Float32Array([
		-0.5, -0.5, 0, 0, 0.5, -0.5, 1, 0, 0.5, 0.5, 1, 1, -0.5, -0.5, 0, 0, 0.5, 0.5, 1, 1, -0.5, 0.5, 0, 1,
	]);

	let { state: backgroundState }: { state: BackgroundState } = $props();
	let canvas: HTMLCanvasElement | undefined = undefined;
	// svelte-ignore state_referenced_locally
	const engine = new LetterGridEngine(backgroundState);

	onMount(() => {
		if (!canvas) return;
		backgroundState.resetMetrics('webgl');

		const gl = canvas.getContext('webgl', {
			alpha: true,
			antialias: backgroundState.config.antialias,
			premultipliedAlpha: true,
		});
		const instanced = gl?.getExtension('ANGLE_instanced_arrays');
		if (!gl || !instanced) return;

		const glyphProgram = createGlyphProgram(gl);
		const smokeProgram = createSmokeProgram(gl);
		const quadBuffer = createStaticBuffer(gl, quadData);
		const instanceBuffer = gl.createBuffer();
		const smokeBuffer = gl.createBuffer();
		if (!instanceBuffer || !smokeBuffer) return;
		const vertexArrays = createVertexArrays(gl, instanced, quadBuffer, instanceBuffer, smokeBuffer);

		let frame = 0;
		let engineNow = 0;
		let lastDrawAt = 0;
		let pausedByBlur = false;
		let instanceUpload: InstanceUploadState = { capacity: 0, count: 0, data: new Float32Array(0) };
		let atlas: Atlas | undefined;
		let colors = readThemeColors();
		let smokeData = new Float32Array(maxSmokeBursts * smokeInstanceFloats);
		let resizeFrame = 0;
		const resize = () => resizeCanvas(canvas!, gl);
		const scheduleResize = () => {
			if (resizeFrame) return;
			resizeFrame = window.requestAnimationFrame(() => {
				resizeFrame = 0;
				resize();
			});
		};
		const themeObserver = new MutationObserver(() => (colors = readThemeColors()));
		const stopActions = backgroundState.onAction(action => {
			engine.handleAction(action, window.innerWidth, window.innerHeight, engineNow || performance.now());
			if (action.type === 'config' && (action.key === 'glyphs' || action.key === 'specialGlyphs')) {
				if (atlas) gl.deleteTexture(atlas.texture);
				atlas = undefined;
				instanceUpload.capacity = 0;
			}
			if (action.type === 'config' && action.key === 'renderPixelRatio') scheduleResize();
		});
		const shouldRun = () => document.visibilityState === 'visible' && !pausedByBlur;
		const startLoop = () => {
			if (frame || !shouldRun()) return;
			frame = window.requestAnimationFrame(tick);
		};
		const stopLoop = () => {
			if (frame) window.cancelAnimationFrame(frame);
			frame = 0;
			lastDrawAt = 0;
		};
		const handleVisibility = () => {
			if (shouldRun()) startLoop();
			else stopLoop();
		};
		const handleBlur = () => {
			pausedByBlur = true;
			stopLoop();
		};
		const handleFocus = () => {
			pausedByBlur = false;
			startLoop();
		};

		resize();
		window.addEventListener('resize', scheduleResize);
		window.addEventListener('blur', handleBlur);
		window.addEventListener('focus', handleFocus);
		document.addEventListener('visibilitychange', handleVisibility);
		themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		const tick = (now: number) => {
			frame = 0;
			if (!shouldRun()) {
				lastDrawAt = 0;
				return;
			}

			const minFrameMs = 1000 / Math.max(1, backgroundState.config.targetFps);
			if (lastDrawAt !== 0 && now - lastDrawAt < minFrameMs * 0.95) {
				startLoop();
				return;
			}

			const frameMs = lastDrawAt === 0 ? 0 : now - lastDrawAt;
			lastDrawAt = now;
			engineNow = engineNow === 0 ? now : engineNow + frameMs;

			const updateStartedAt = performance.now();
			engine.update(engineNow, window.innerWidth, window.innerHeight);
			atlas ??= createAtlas(gl);
			instanceUpload = syncInstances(gl, instanceBuffer, atlas, instanceUpload);

			const drawStartedAt = performance.now();
			drawGlyphs(
				gl,
				instanced,
				glyphProgram,
				quadBuffer,
				instanceBuffer,
				atlas,
				instanceUpload.count,
				vertexArrays,
				colors.text,
				engineNow,
			);
			drawSmoke(gl, instanced, smokeProgram, quadBuffer, smokeBuffer, smokeData, vertexArrays, colors.smoke, engineNow);
			const finishedAt = performance.now();

			backgroundState.recordFrame(
				'webgl',
				frameMs,
				drawStartedAt - updateStartedAt,
				finishedAt - drawStartedAt,
				engine.cells.length,
				engine.puffs.length,
				engine.gridColumns,
				engine.gridRows,
				engine.spacing.current,
				engine.gridShiftX,
				engine.gridShiftY,
				engineNow,
			);
			startLoop();
		};
		startLoop();

		return () => {
			stopActions();
			themeObserver.disconnect();
			if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
			stopLoop();
			window.removeEventListener('resize', scheduleResize);
			window.removeEventListener('blur', handleBlur);
			window.removeEventListener('focus', handleFocus);
			document.removeEventListener('visibilitychange', handleVisibility);
			if (atlas) gl.deleteTexture(atlas.texture);
			if (vertexArrays) {
				vertexArrays.extension.deleteVertexArrayOES(vertexArrays.glyph);
				vertexArrays.extension.deleteVertexArrayOES(vertexArrays.smoke);
			}
			gl.deleteBuffer(quadBuffer);
			gl.deleteBuffer(instanceBuffer);
			gl.deleteBuffer(smokeBuffer);
			gl.deleteProgram(glyphProgram.program);
			gl.deleteProgram(smokeProgram.program);
		};
	});

	function resizeCanvas(target: HTMLCanvasElement, gl: WebGLRenderingContext): void {
		const ratio = currentPixelRatio();
		const rect = target.getBoundingClientRect();
		const width = Math.max(1, Math.ceil(rect.width || window.innerWidth));
		const height = Math.max(1, Math.ceil(rect.height || window.innerHeight));
		const pixelWidth = Math.ceil(width * ratio);
		const pixelHeight = Math.ceil(height * ratio);
		if (target.width !== pixelWidth) target.width = pixelWidth;
		if (target.height !== pixelHeight) target.height = pixelHeight;
		gl.viewport(0, 0, target.width, target.height);
	}

	function currentPixelRatio(): number {
		return Math.max(0.5, Math.min(window.devicePixelRatio || 1, backgroundState.config.renderPixelRatio));
	}

	function createStaticBuffer(gl: WebGLRenderingContext, data: Float32Array): WebGLBuffer {
		const buffer = gl.createBuffer();
		if (!buffer) throw new Error('Unable to create background buffer');
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		return buffer;
	}

	function createAtlas(gl: WebGLRenderingContext): Atlas {
		const chars = uniqueChars([...backgroundState.config.glyphs, ...backgroundState.config.specialGlyphs]);
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
		const fallbackUv: [number, number, number, number] = entries.values().next().value ?? [0, 0, 1, 1];

		const texture = gl.createTexture();
		if (!texture) throw new Error('Unable to create background atlas texture');
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		return { texture, entries, fallbackUv };
	}

	function createVertexArrays(
		gl: WebGLRenderingContext,
		instanced: ANGLE_instanced_arrays,
		quadBuffer: WebGLBuffer,
		instanceBuffer: WebGLBuffer,
		smokeBuffer: WebGLBuffer,
	): VertexArrayState | undefined {
		const extension = gl.getExtension('OES_vertex_array_object');
		const glyph = extension?.createVertexArrayOES();
		const smoke = extension?.createVertexArrayOES();
		if (!extension || !glyph || !smoke) return undefined;

		extension.bindVertexArrayOES(glyph);
		setupGlyphAttributes(gl, instanced, quadBuffer, instanceBuffer);
		extension.bindVertexArrayOES(smoke);
		setupSmokeAttributes(gl, instanced, quadBuffer, smokeBuffer);
		extension.bindVertexArrayOES(null);
		return { extension, glyph, smoke };
	}

	function syncInstances(
		gl: WebGLRenderingContext,
		buffer: WebGLBuffer,
		atlas: Atlas,
		upload: InstanceUploadState,
	): InstanceUploadState {
		const cellCount = engine.cells.length;
		const shouldResize =
			upload.capacity < cellCount || (upload.capacity > cellCount * 1.35 && upload.capacity - cellCount > 128);
		if (shouldResize) {
			const data = new Float32Array(cellCount * instanceFloats);
			for (let index = 0; index < cellCount; index += 1) {
				writeCellInstance(data, index, atlas);
			}
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
			engine.clearDirtyCellIndexes();
			return { capacity: cellCount, count: cellCount, data };
		}

		const dirtyIndexes = engine.consumeDirtyCellIndexes().filter(index => index >= 0 && index < cellCount);
		upload.count = cellCount;
		if (dirtyIndexes.length === 0) return upload;

		dirtyIndexes.sort((a, b) => a - b);
		for (const index of dirtyIndexes) writeCellInstance(upload.data, index, atlas);

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		let rangeStart = dirtyIndexes[0];
		let previous = rangeStart;
		for (let index = 1; index <= dirtyIndexes.length; index += 1) {
			const next = dirtyIndexes[index];
			if (next === previous + 1) {
				previous = next;
				continue;
			}
			gl.bufferSubData(
				gl.ARRAY_BUFFER,
				rangeStart * instanceStride,
				upload.data.subarray(rangeStart * instanceFloats, (previous + 1) * instanceFloats),
			);
			rangeStart = next;
			previous = next;
		}

		return upload;
	}

	function writeCellInstance(data: Float32Array, index: number, atlas: Atlas): void {
		const cell = engine.cells[index];
		const uv = atlas.entries.get(cell.char) ?? atlas.fallbackUv;
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
		data[offset + 10] = 0;
		data[offset + 11] = 0;
		data[offset + 12] = cell.spawnStartedAt;
		data[offset + 13] = cell.spawnMs;
		data[offset + 14] = cell.deathStartedAt;
		data[offset + 15] = cell.decayMs;
	}

	function drawGlyphs(
		gl: WebGLRenderingContext,
		instanced: ANGLE_instanced_arrays,
		glyphProgram: GlyphProgram,
		quadBuffer: WebGLBuffer,
		instanceBuffer: WebGLBuffer,
		atlas: Atlas,
		instanceCount: number,
		vertexArrays: VertexArrayState | undefined,
		color: [number, number, number, number],
		now: number,
	): void {
		const ratio = currentPixelRatio();
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.useProgram(glyphProgram.program);
		if (vertexArrays) vertexArrays.extension.bindVertexArrayOES(vertexArrays.glyph);
		else setupGlyphAttributes(gl, instanced, quadBuffer, instanceBuffer);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
		gl.uniform2f(glyphProgram.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.uniform1f(glyphProgram.pixelRatio, ratio);
		gl.uniform2f(glyphProgram.gridShift, engine.gridShiftX, engine.gridShiftY);
		gl.uniform1f(glyphProgram.spacing, engine.spacing.current);
		gl.uniform1f(glyphProgram.glyphSize, backgroundState.config.glyphBaseSize);
		gl.uniform1f(glyphProgram.time, now);
		gl.uniform1f(glyphProgram.displayAngle, engine.direction.displayAngle);
		gl.uniform1f(glyphProgram.spinStartedAt, engine.direction.spinStartedAt);
		gl.uniform1f(glyphProgram.spinEnabled, engine.direction.phase === 'cruise' ? 1 : 0);
		gl.uniform1f(glyphProgram.spinMultiplier, backgroundState.config.spinSpeedMultiplier);
		gl.uniform4f(glyphProgram.color, color[0], color[1], color[2], color[3]);
		instanced.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, instanceCount);
	}

	function drawSmoke(
		gl: WebGLRenderingContext,
		instanced: ANGLE_instanced_arrays,
		smokeProgram: SmokeProgram,
		quadBuffer: WebGLBuffer,
		smokeBuffer: WebGLBuffer,
		smokeData: Float32Array,
		vertexArrays: VertexArrayState | undefined,
		color: [number, number, number, number],
		now: number,
	): void {
		const start = Math.max(0, engine.puffs.length - maxSmokeBursts);
		const count = engine.puffs.length - start;
		if (count === 0) return;

		for (let index = 0; index < count; index += 1) {
			const puff = engine.puffs[start + index];
			const offset = index * smokeInstanceFloats;
			smokeData[offset] = puff.x;
			smokeData[offset + 1] = puff.y;
			smokeData[offset + 2] = puff.dx;
			smokeData[offset + 3] = puff.dy;
			smokeData[offset + 4] = puff.createdAt;
			smokeData[offset + 5] = puff.ttl;
			smokeData[offset + 6] = puff.scale;
			smokeData[offset + 7] = puff.endScale;
			smokeData[offset + 8] = puff.opacity;
			smokeData[offset + 9] = (puff.rotation * Math.PI) / 180;
			smokeData[offset + 10] = (puff.endRotation * Math.PI) / 180;
			smokeData[offset + 11] = puff.screenLocked ? -puff.id : puff.id;
		}

		const ratio = currentPixelRatio();
		gl.bindBuffer(gl.ARRAY_BUFFER, smokeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, smokeData.subarray(0, count * smokeInstanceFloats), gl.DYNAMIC_DRAW);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
		gl.useProgram(smokeProgram.program);
		if (vertexArrays) vertexArrays.extension.bindVertexArrayOES(vertexArrays.smoke);
		else setupSmokeAttributes(gl, instanced, quadBuffer, smokeBuffer);
		gl.uniform2f(smokeProgram.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.uniform1f(smokeProgram.pixelRatio, ratio);
		gl.uniform2f(smokeProgram.gridShift, engine.gridShiftX, engine.gridShiftY);
		gl.uniform1f(smokeProgram.glyphSize, backgroundState.config.glyphBaseSize);
		gl.uniform1f(smokeProgram.time, now);
		gl.uniform4f(smokeProgram.color, color[0], color[1], color[2], color[3]);
		instanced.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, count);
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

	function setupSmokeAttributes(
		gl: WebGLRenderingContext,
		instanced: ANGLE_instanced_arrays,
		quadBuffer: WebGLBuffer,
		smokeBuffer: WebGLBuffer,
	): void {
		for (let location = 1; location <= 7; location += 1) gl.disableVertexAttribArray(location);
		gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
		instanced.vertexAttribDivisorANGLE(0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, smokeBuffer);
		for (let location = 1; location <= 3; location += 1) gl.enableVertexAttribArray(location);
		gl.vertexAttribPointer(1, 4, gl.FLOAT, false, smokeInstanceStride, 0);
		gl.vertexAttribPointer(2, 4, gl.FLOAT, false, smokeInstanceStride, 16);
		gl.vertexAttribPointer(3, 4, gl.FLOAT, false, smokeInstanceStride, 32);
		for (let location = 1; location <= 3; location += 1) instanced.vertexAttribDivisorANGLE(location, 1);
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
				uniform float u_glyphSize;
				uniform float u_time;
				uniform float u_displayAngle;
				uniform float u_spinStartedAt;
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
						scale *= 1.0 - progress;
					}

					float size = u_glyphSize * max(0.8, scale) * u_pixelRatio * step(0.001, alpha);
					float rotation =
						u_displayAngle +
						u_spinEnabled * u_spinMultiplier * (max(0.0, u_time - u_spinStartedAt) * a_style.y + a_style.z);
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
			glyphSize: gl.getUniformLocation(program, 'u_glyphSize'),
			time: gl.getUniformLocation(program, 'u_time'),
			displayAngle: gl.getUniformLocation(program, 'u_displayAngle'),
			spinStartedAt: gl.getUniformLocation(program, 'u_spinStartedAt'),
			spinEnabled: gl.getUniformLocation(program, 'u_spinEnabled'),
			spinMultiplier: gl.getUniformLocation(program, 'u_spinMultiplier'),
			color: gl.getUniformLocation(program, 'u_color'),
		};
	}

	function createSmokeProgram(gl: WebGLRenderingContext): SmokeProgram {
		const program = createProgram(
			gl,
			`
				attribute vec2 a_corner;
				attribute vec4 a_smokeA;
				attribute vec4 a_smokeB;
				attribute vec4 a_smokeC;
				uniform vec2 u_resolution;
				uniform float u_pixelRatio;
				uniform vec2 u_gridShift;
				uniform float u_glyphSize;
				uniform float u_time;
				varying vec2 v_delta;
				varying vec2 v_screen;
				varying float v_alpha;
				varying float v_rotation;
				varying float v_progress;
				varying float v_intensity;
				varying float v_seed;

				float smooth01(float value) {
					float progress = clamp(value, 0.0, 1.0);
					return progress * progress * (3.0 - 2.0 * progress);
				}

				void main() {
					float progress = clamp((u_time - a_smokeB.x) / max(1.0, a_smokeB.y), 0.0, 1.0);
					float eased = smooth01(progress);
					float flash = smoothstep(0.0, 0.08, progress) * (1.0 - smoothstep(0.5, 1.0, progress));
					float locked = step(a_smokeC.w, 0.0);
					vec2 base = mix(u_gridShift + a_smokeA.xy, a_smokeA.xy, locked);
					vec2 center = (base + a_smokeA.zw * eased) * u_pixelRatio;
					float radius = max(1.0, u_glyphSize * mix(a_smokeB.z, a_smokeB.w, eased) * 0.74 * u_pixelRatio);
					float extent = radius * 2.9;
					vec2 screen = center + a_corner * extent;
					vec2 zeroToOne = screen / u_resolution;
					vec2 clip = zeroToOne * 2.0 - 1.0;
					gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
					v_delta = (a_corner * extent) / radius;
					v_screen = screen;
					v_alpha = a_smokeC.x * flash;
					v_rotation = a_smokeC.y + a_smokeC.z * eased * 0.45;
					v_progress = progress;
					v_intensity = a_smokeC.x;
					v_seed = abs(a_smokeC.w);
				}
			`,
			`
				precision highp float;
				uniform vec4 u_color;
				varying vec2 v_delta;
				varying vec2 v_screen;
				varying float v_alpha;
				varying float v_rotation;
				varying float v_progress;
				varying float v_intensity;
				varying float v_seed;

				float hash(vec2 value) {
					return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
				}

				float flameLobe(vec2 value, vec2 offset, float width, float height) {
					vec2 point = (value - offset) / vec2(width, height);
					return exp(-dot(point, point));
				}

				void main() {
					float cosRotation = cos(v_rotation);
					float sinRotation = sin(v_rotation);
					vec2 warped = vec2(
						v_delta.x * cosRotation - v_delta.y * sinRotation,
						v_delta.x * sinRotation + v_delta.y * cosRotation
					);
					float flicker = hash(floor(v_screen / 5.0) + vec2(v_seed * 1.7, floor(v_progress * 18.0)));
					float rise = -warped.y + v_progress * 0.72;
					float taper = clamp((rise + 0.18) / 2.2, 0.0, 1.0);
					float width = mix(0.72, 0.15, taper);
					float wavering = (flicker - 0.5) * 0.28 * (0.25 + taper);
					warped += vec2(
						sin(rise * 4.2 + v_seed) * 0.11 + wavering,
						cos(warped.x * 2.4 + v_seed * 0.71) * 0.05 * taper
					);
					float baseGlow = flameLobe(warped, vec2(0.0, 0.2), 0.86, 0.62) * 0.42;
					float tongue =
						flameLobe(warped, vec2(-0.18, -0.34), width * 0.72, 1.05) * 0.44 +
						flameLobe(warped, vec2(0.18, -0.68), width * 0.55, 0.92) * 0.34 +
						flameLobe(warped, vec2(0.02, -1.1), width * 0.38, 0.66) * 0.3;
					float core = flameLobe(warped, vec2(0.0, -0.28), width * 0.34, 0.74);
					float ember = smoothstep(0.82, 1.0, flicker) * flameLobe(warped, vec2(0.0, 0.58), 1.05, 0.36) * 0.2;
					float heightFade = smoothstep(-0.55, 0.08, rise) * (1.0 - smoothstep(2.35, 3.05, rise));
					float edgeFade = 1.0 - smoothstep(1.65, 2.25, max(abs(v_delta.x), abs(v_delta.y)));
					float heat = clamp(baseGlow + tongue + ember, 0.0, 1.0) * heightFade;
					float alpha = v_alpha * heat * edgeFade;
					if (alpha <= 0.002) discard;
					vec3 emberColor = mix(vec3(0.42, 0.05, 0.14), u_color.rgb * 0.75, 0.32);
					vec3 orange = vec3(1.0, 0.28, 0.05);
					vec3 gold = vec3(1.0, 0.75, 0.16);
					vec3 whiteHot = vec3(1.0, 0.96, 0.7);
					vec3 color = mix(emberColor, orange, smoothstep(0.05, 0.42, heat));
					color = mix(color, gold, smoothstep(0.28, 0.72, core));
					color = mix(color, whiteHot, smoothstep(0.55, 1.0, core) * (1.0 - smoothstep(0.28, 0.9, v_progress)));
					color *= mix(1.22, 0.58, smoothstep(0.0, 1.0, v_progress));
					gl_FragColor = vec4(color, u_color.a * clamp(alpha * (1.05 + v_intensity * 0.22), 0.0, 0.9));
				}
			`,
			['a_corner', 'a_smokeA', 'a_smokeB', 'a_smokeC'],
		);
		return {
			program,
			resolution: gl.getUniformLocation(program, 'u_resolution'),
			pixelRatio: gl.getUniformLocation(program, 'u_pixelRatio'),
			gridShift: gl.getUniformLocation(program, 'u_gridShift'),
			glyphSize: gl.getUniformLocation(program, 'u_glyphSize'),
			time: gl.getUniformLocation(program, 'u_time'),
			color: gl.getUniformLocation(program, 'u_color'),
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
