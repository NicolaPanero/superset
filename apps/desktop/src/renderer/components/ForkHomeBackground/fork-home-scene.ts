import { FORK_DISPLAY_NAME } from "~/fork-display-name";
import { ForkHomeRipples, RIPPLE_LIMIT } from "./fork-home-ripples";
import {
	COMPOSE_SHADER,
	FIELD_SHADER,
	VERTEX_SHADER,
} from "./fork-home-shaders";

const MAX_PIXELS = 8_300_000;
const CELL_WIDTH = 7;
const CELL_HEIGHT = 14;
const GLYPHS =
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{}<>/+=*";
const LOGO_TEXT = FORK_DISPLAY_NAME.toUpperCase();
const LOGO_PATHS = [
	"M2 5h4v2H4v2H2v4h2v2h2v2H2v-4H0V9h2V5Z",
	"M7 5h3v2H9v2H7v4h2v2h1v2H7v-4H5V9h2V5Z",
	"M12 5h3v4h2v4h-2v4h-3v-2h1v-2h2V9h-2V7h-1V5Z",
	"M16 5h4v4h2v4h-2v4h-4v-2h2v-2h2V9h-2V7h-2V5Z",
	"M10 8h2v2h2v2h-2v2h-2v-2H8v-2h2V8Z",
];
const LOGO_WIDTH = 22;
const LOGO_MARGIN = 1.5;
const INTERACTIVE_TARGETS =
	'button, a, input, textarea, select, [role="button"], [role="menu"], [role="dialog"], [contenteditable="true"]';

function compile(gl: WebGL2RenderingContext, fragment: string) {
	const program = gl.createProgram();
	for (const [type, source] of [
		[gl.VERTEX_SHADER, VERTEX_SHADER],
		[gl.FRAGMENT_SHADER, fragment],
	] as const) {
		const shader = gl.createShader(type);
		if (!shader) return null;
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		gl.attachShader(program, shader);
		gl.deleteShader(shader);
	}
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error("[fork-home] shader:", gl.getProgramInfoLog(program));
		gl.deleteProgram(program);
		return null;
	}
	const uniforms = new Map<string, WebGLUniformLocation | null>();
	return {
		program,
		uniform: (name: string) => {
			if (!uniforms.has(name))
				uniforms.set(name, gl.getUniformLocation(program, name));
			return uniforms.get(name) ?? null;
		},
	};
}

const bindProgram = (gl: WebGL2RenderingContext, program: WebGLProgram) =>
	WebGL2RenderingContext.prototype.useProgram.call(gl, program);

function texture(gl: WebGL2RenderingContext, filter: number) {
	const result = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, result);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	return result;
}

function rgb(color: string) {
	const probe = document.createElement("canvas").getContext("2d");
	if (!probe) return [1, 1, 1] as const;
	probe.fillStyle = color;
	probe.fillRect(0, 0, 1, 1);
	const [red = 255, green = 255, blue = 255] = probe.getImageData(
		0,
		0,
		1,
		1,
	).data;
	return [red / 255, green / 255, blue / 255] as const;
}

function logoMask() {
	const scale = 8;
	const width = (LOGO_WIDTH + LOGO_MARGIN * 2) * scale;
	const height = (12 + LOGO_MARGIN * 2) * scale;
	const layers = [0, 10].map((blur) => {
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) return new Uint8ClampedArray(width * height * 4);
		context.filter = blur ? `blur(${blur}px)` : "none";
		context.setTransform(
			scale,
			0,
			0,
			scale,
			LOGO_MARGIN * scale,
			(LOGO_MARGIN - 5) * scale,
		);
		context.fillStyle = "#fff";
		for (const path of LOGO_PATHS) context.fill(new Path2D(path));
		return context.getImageData(0, 0, width, height).data;
	});
	const pixels = new Uint8Array(width * height * 4);
	for (let index = 0; index < width * height; index++) {
		pixels[index * 4] = layers[0]?.[index * 4 + 3] ?? 0;
		pixels[index * 4 + 1] = Math.min(
			255,
			(layers[1]?.[index * 4 + 3] ?? 0) * 1.6,
		);
	}
	return { width, height, pixels };
}

export function mountForkHomeScene(canvas: HTMLCanvasElement) {
	const host = canvas.parentElement;
	const gl = canvas.getContext("webgl2", {
		alpha: true,
		antialias: false,
		depth: false,
		stencil: false,
		premultipliedAlpha: true,
		powerPreference: "low-power",
	});
	if (!host || !gl) return () => {};
	const field = compile(gl, FIELD_SHADER);
	const compose = compile(gl, COMPOSE_SHADER);
	if (!field || !compose) return () => {};
	const fieldTexture = texture(gl, gl.LINEAR);
	const atlasTexture = texture(gl, gl.NEAREST);
	const maskTexture = texture(gl, gl.LINEAR);
	const framebuffer = gl.createFramebuffer();
	const vertices = gl.createVertexArray();
	const ripples = new ForkHomeRipples();
	const rippleData = new Float32Array(RIPPLE_LIMIT * 4);
	const logoGlyphs = new Int32Array(
		[...LOGO_TEXT].map((character) => Math.max(0, GLYPHS.indexOf(character))),
	);
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const start = performance.now();
	let width = 0;
	let height = 0;
	let columns = 0;
	let rows = 0;
	let cellPixels = [CELL_WIDTH, CELL_HEIGHT];
	let cellSize = [CELL_WIDTH, CELL_HEIGHT];
	let colors = { ink: rgb("#fff"), ember: rgb("#fff"), crest: rgb("#fff") };
	let frame = 0;
	let lastPaint = 0;
	let nextDrift = start + 600;
	let pointer = { x: 0, y: 0, travel: 0, last: 0 };
	let disposed = false;
	let focused = document.hasFocus();
	let visible = true;
	let brand: Element | null = null;

	const mask = logoMask();
	gl.bindTexture(gl.TEXTURE_2D, maskTexture);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGBA,
		mask.width,
		mask.height,
		0,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		mask.pixels,
	);

	function stop() {
		cancelAnimationFrame(frame);
		frame = 0;
	}

	function logoArea() {
		if (!brand) return [-1, -1, 0, 0] as const;
		const origin = host?.getBoundingClientRect();
		const rect = brand.getBoundingClientRect();
		const unit = rect.width / LOGO_WIDTH;
		return [
			rect.left - (origin?.left ?? 0) - unit * LOGO_MARGIN,
			rect.top - (origin?.top ?? 0) - unit * LOGO_MARGIN,
			rect.width + unit * LOGO_MARGIN * 2,
			rect.height + unit * LOGO_MARGIN * 2,
		] as const;
	}

	const draw = (now: number) => {
		if (!columns || !rows) return;
		const still = motion.matches;
		if (!still && now >= nextDrift) {
			ripples.drift(Math.random() * width, Math.random() * height, now);
			nextDrift = now + 1400 + Math.random() * 2200;
		}
		const count = still ? 0 : ripples.write(rippleData, now);
		const time = still ? 40 : (now - start) / 1000;

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.viewport(0, 0, columns, rows);
		bindProgram(gl, field.program);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, maskTexture);
		gl.uniform1i(field.uniform("uLogoMask"), 2);
		gl.uniform4f(field.uniform("uLogo"), ...logoArea());
		gl.uniform2f(field.uniform("uCell"), cellSize[0] ?? 1, cellSize[1] ?? 1);
		gl.uniform2f(field.uniform("uSize"), width, height);
		gl.uniform1f(field.uniform("uTime"), time);
		gl.uniform1i(field.uniform("uCount"), count);
		if (count)
			gl.uniform4fv(field.uniform("uRipples"), rippleData, 0, count * 4);
		gl.bindVertexArray(vertices);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, canvas.width, canvas.height);
		bindProgram(gl, compose.program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
		gl.uniform1i(compose.uniform("uField"), 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
		gl.uniform1i(compose.uniform("uAtlas"), 1);
		gl.uniform2i(
			compose.uniform("uCellPixels"),
			cellPixels[0] ?? 1,
			cellPixels[1] ?? 1,
		);
		gl.uniform1f(compose.uniform("uHeight"), canvas.height);
		gl.uniform1f(compose.uniform("uTime"), time);
		gl.uniform1i(compose.uniform("uGlyphs"), GLYPHS.length);
		gl.uniform1iv(compose.uniform("uLogoGlyphs"), logoGlyphs);
		gl.uniform1f(compose.uniform("uLogoRest"), 0.22);
		gl.uniform1f(compose.uniform("uDriftAlpha"), 0.135);
		gl.uniform3fv(compose.uniform("uInk"), colors.ink);
		gl.uniform3fv(compose.uniform("uEmber"), colors.ember);
		gl.uniform3fv(compose.uniform("uCrest"), colors.crest);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	};

	const tick = (now: number) => {
		frame = 0;
		if (now - lastPaint >= 1000 / (ripples.clicking(now) ? 60 : 30) - 2) {
			lastPaint = now;
			draw(now);
		}
		schedule();
	};

	function schedule() {
		if (disposed || !visible || !focused || document.hidden || motion.matches) {
			stop();
			return;
		}
		if (!frame) frame = requestAnimationFrame(tick);
	}

	function readColors() {
		const style = getComputedStyle(canvas);
		colors = {
			ink: rgb(style.color),
			ember: rgb(style.getPropertyValue("--fork-home-ember").trim()),
			crest: rgb(style.getPropertyValue("--fork-home-crest").trim()),
		};
	}

	const resize = () => {
		const bounds = host.getBoundingClientRect();
		width = Math.round(bounds.width);
		height = Math.round(bounds.height);
		if (!width || !height) {
			stop();
			return;
		}
		const scale = Math.min(
			window.devicePixelRatio || 1,
			2,
			Math.sqrt(MAX_PIXELS / (width * height)),
		);
		cellPixels = [
			Math.max(4, Math.round(CELL_WIDTH * scale)),
			Math.max(8, Math.round(CELL_HEIGHT * scale)),
		];
		cellSize = [(cellPixels[0] ?? 1) / scale, (cellPixels[1] ?? 1) / scale];
		canvas.width = Math.round(width * scale);
		canvas.height = Math.round(height * scale);
		columns = Math.ceil(canvas.width / (cellPixels[0] ?? 1));
		rows = Math.ceil(canvas.height / (cellPixels[1] ?? 1));

		gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			columns,
			rows,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			null,
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			fieldTexture,
			0,
		);

		const atlas = document.createElement("canvas");
		atlas.width = GLYPHS.length * (cellPixels[0] ?? 1);
		atlas.height = cellPixels[1] ?? 1;
		const ink = atlas.getContext("2d");
		if (ink) {
			ink.font = `500 ${(10 * (cellPixels[0] ?? 1)) / CELL_WIDTH}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
			ink.textAlign = "center";
			ink.textBaseline = "middle";
			ink.fillStyle = "#fff";
			for (let index = 0; index < GLYPHS.length; index++)
				ink.fillText(
					GLYPHS[index] ?? "0",
					Math.round((index + 0.5) * (cellPixels[0] ?? 1)),
					Math.round(atlas.height / 2),
				);
		}
		gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
		atlas.width = atlas.height = 0;

		brand = host.querySelector(".fork-home-brand");
		readColors();
		draw(performance.now());
		schedule();
	};

	function onPointerDown(event: PointerEvent) {
		if (
			motion.matches ||
			event.button !== 0 ||
			!event.isPrimary ||
			!(event.target instanceof Element) ||
			event.target.closest(INTERACTIVE_TARGETS)
		)
			return;
		const bounds = canvas.getBoundingClientRect();
		ripples.click(
			event.clientX - bounds.left,
			event.clientY - bounds.top,
			performance.now(),
		);
		schedule();
	}
	function onPointerMove(event: PointerEvent) {
		if (motion.matches || event.pointerType !== "mouse") return;
		const bounds = canvas.getBoundingClientRect();
		const x = event.clientX - bounds.left;
		const y = event.clientY - bounds.top;
		const now = performance.now();
		pointer.travel += Math.hypot(x - pointer.x, y - pointer.y);
		pointer = { ...pointer, x, y };
		if (pointer.travel < 260 || now - pointer.last < 700) return;
		if (ripples.drift(x, y, now)) pointer = { x, y, travel: 0, last: now };
		schedule();
	}
	function onVisibility() {
		schedule();
	}
	function onFocus() {
		focused = true;
		schedule();
	}
	function onBlur() {
		focused = false;
		stop();
	}
	function onMotionChange() {
		ripples.clear();
		draw(performance.now());
		schedule();
	}
	function onThemeChange() {
		readColors();
		draw(performance.now());
	}
	function onContextLost(event: Event) {
		event.preventDefault();
		disposed = true;
		stop();
	}
	const resizeObserver = new ResizeObserver(resize);
	resizeObserver.observe(host);
	const intersectionObserver = new IntersectionObserver(([entry]) => {
		visible = entry?.isIntersecting ?? false;
		schedule();
	});
	intersectionObserver.observe(canvas);
	const themeObserver = new MutationObserver(onThemeChange);
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class", "style"],
	});
	host.addEventListener("pointerdown", onPointerDown, { passive: true });
	host.addEventListener("pointermove", onPointerMove, { passive: true });
	canvas.addEventListener("webglcontextlost", onContextLost);
	document.addEventListener("visibilitychange", onVisibility);
	window.addEventListener("focus", onFocus);
	window.addEventListener("blur", onBlur);
	window.addEventListener("resize", resize);
	motion.addEventListener("change", onMotionChange);
	resize();

	return () => {
		disposed = true;
		stop();
		resizeObserver.disconnect();
		intersectionObserver.disconnect();
		themeObserver.disconnect();
		host.removeEventListener("pointerdown", onPointerDown);
		host.removeEventListener("pointermove", onPointerMove);
		canvas.removeEventListener("webglcontextlost", onContextLost);
		document.removeEventListener("visibilitychange", onVisibility);
		window.removeEventListener("focus", onFocus);
		window.removeEventListener("blur", onBlur);
		window.removeEventListener("resize", resize);
		motion.removeEventListener("change", onMotionChange);
		gl.deleteTexture(fieldTexture);
		gl.deleteTexture(atlasTexture);
		gl.deleteTexture(maskTexture);
		gl.deleteFramebuffer(framebuffer);
		gl.deleteVertexArray(vertices);
		gl.deleteProgram(field.program);
		gl.deleteProgram(compose.program);
		canvas.width = 0;
		canvas.height = 0;
	};
}
