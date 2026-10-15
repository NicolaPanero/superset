import { createForkHomeLogo } from "./components/ForkHomeBrand/fork-home-logo";
import { ForkHomeWaves } from "./fork-home-waves";

const MAX_PIXELS = 1_200_000;
const INTERACTIVE_TARGETS =
	'button, a, input, textarea, select, [role="button"], [role="menu"], [role="dialog"], [contenteditable="true"]';

export function mountForkHomeScene(canvas: HTMLCanvasElement) {
	const host = canvas.parentElement;
	const context = canvas.getContext("2d");
	if (!host || !context) return () => {};
	const texture = document.createElement("canvas");
	const textureContext = texture.getContext("2d");
	const layer = document.createElement("canvas");
	const layerContext = layer.getContext("2d");
	const field = document.createElement("canvas");
	const fieldContext = field.getContext("2d");
	if (!textureContext || !layerContext || !fieldContext) return () => {};
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	let width = 0;
	let height = 0;
	let frame = 0;
	let lastPaint = 0;
	let disposed = false;
	let focused = document.hasFocus();
	let visible = true;
	let pixels: ImageData;
	let waves: ForkHomeWaves;
	let logo: ReturnType<typeof createForkHomeLogo>;
	let logoBounds = { x: 0, y: 0, width: 0, height: 0 };

	function stop() {
		cancelAnimationFrame(frame);
		frame = 0;
	}

	const draw = (now: number) => {
		if (!width || !height) return;
		if (!motion.matches) waves.advance(now);
		const data = pixels.data;
		for (let row = 0; row < field.height; row++) {
			const y = (row / (field.height - 1)) * height;
			for (let column = 0; column < field.width; column++) {
				const x = (column / (field.width - 1)) * width;
				const energy =
					0.012 +
					waves.sampleAmbient(x, y) * 0.3 +
					waves.sampleInteraction(x, y) * 0.85;
				const centerX =
					(x - width / 2) / Math.max(1, Math.min(450, width * 0.28));
				const centerY = (y - height * 0.45) / Math.max(1, height * 0.75);
				const quiet = 1 - Math.exp(-(centerX ** 4 + centerY ** 4) * 1.5) * 0.94;
				data[(row * field.width + column) * 4 + 3] = Math.min(
					220,
					energy * quiet * 255,
				);
			}
		}
		fieldContext.putImageData(pixels, 0, 0);
		layerContext.globalCompositeOperation = "source-over";
		layerContext.clearRect(0, 0, layer.width, layer.height);
		layerContext.drawImage(texture, 0, 0);
		layerContext.globalCompositeOperation = "destination-in";
		layerContext.drawImage(field, 0, 0, layer.width, layer.height);
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(layer, 0, 0);
		logo?.paint((x, y) =>
			waves.sampleInteraction(
				logoBounds.x + x * logoBounds.width,
				logoBounds.y + y * logoBounds.height,
			),
		);
	};

	const tick = (now: number) => {
		frame = 0;
		const interval = 1000 / (waves.active ? 30 : 15);
		if (now - lastPaint >= interval - 1) {
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

	const resize = () => {
		const bounds = host.getBoundingClientRect();
		const nextWidth = Math.round(bounds.width);
		const nextHeight = Math.round(bounds.height);
		if (!nextWidth || !nextHeight) {
			stop();
			return;
		}
		if (nextWidth !== width || nextHeight !== height) {
			width = nextWidth;
			height = nextHeight;
			waves = new ForkHomeWaves(width, height, performance.now());
		}
		const scale = Math.min(
			window.devicePixelRatio || 1,
			1.5,
			Math.sqrt(MAX_PIXELS / (width * height)),
		);
		for (const surface of [canvas, texture, layer]) {
			surface.width = Math.max(1, Math.floor(width * scale));
			surface.height = Math.max(1, Math.floor(height * scale));
		}
		field.width = waves.columns;
		field.height = waves.rows;
		pixels = fieldContext.createImageData(field.width, field.height);
		pixels.data.fill(255);
		textureContext.setTransform(scale, 0, 0, scale, 0, 0);
		textureContext.font = "9px Menlo, Consolas, monospace";
		textureContext.textBaseline = "middle";
		const gradient = textureContext.createLinearGradient(0, 0, width, height);
		gradient.addColorStop(0, getComputedStyle(canvas).color);
		gradient.addColorStop(1, "#57c6b9");
		textureContext.fillStyle = gradient;
		const characters = "01{}[]<>/+=:;abcdef0123456789";
		const columns = Math.ceil(width / textureContext.measureText("0").width);
		for (let row = 0; row < Math.ceil(height / 14); row++) {
			let line = "";
			for (let column = 0; column < columns; column++) {
				const hash =
					Math.imul(column + 17, 374761393) ^ Math.imul(row + 31, 668265263);
				line += characters[(hash >>> 0) % characters.length];
			}
			textureContext.fillText(line, 0, row * 14 + 7);
		}
		logo?.dispose();
		const brand = host.querySelector<HTMLCanvasElement>(".fork-home-brand");
		if (brand) {
			logo = createForkHomeLogo(brand);
			const rect = brand.getBoundingClientRect();
			logoBounds = {
				x: rect.left - bounds.left,
				y: rect.top - bounds.top,
				width: rect.width,
				height: rect.height,
			};
		}
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
		waves.click(event.clientX - bounds.left, event.clientY - bounds.top);
		schedule();
	}
	function onVisibility() {
		waves.resume(performance.now());
		schedule();
	}
	function onFocus() {
		focused = true;
		waves.resume(performance.now());
		schedule();
	}
	function onBlur() {
		focused = false;
		stop();
	}
	function onMotionChange() {
		waves.clearInteraction();
		waves.resume(performance.now());
		draw(performance.now());
		schedule();
	}
	const resizeObserver = new ResizeObserver(resize);
	resizeObserver.observe(host);
	const intersectionObserver = new IntersectionObserver(([entry]) => {
		visible = entry?.isIntersecting ?? false;
		waves?.resume(performance.now());
		schedule();
	});
	intersectionObserver.observe(canvas);
	const themeObserver = new MutationObserver(resize);
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class", "style"],
	});
	host.addEventListener("pointerdown", onPointerDown, { passive: true });
	document.addEventListener("visibilitychange", onVisibility);
	window.addEventListener("focus", onFocus);
	window.addEventListener("blur", onBlur);
	window.addEventListener("resize", resize);
	motion.addEventListener("change", onMotionChange);
	resize();

	return () => {
		disposed = true;
		stop();
		logo?.dispose();
		resizeObserver.disconnect();
		intersectionObserver.disconnect();
		themeObserver.disconnect();
		host.removeEventListener("pointerdown", onPointerDown);
		document.removeEventListener("visibilitychange", onVisibility);
		window.removeEventListener("focus", onFocus);
		window.removeEventListener("blur", onBlur);
		window.removeEventListener("resize", resize);
		motion.removeEventListener("change", onMotionChange);
		for (const surface of [canvas, texture, layer, field]) {
			surface.width = 0;
			surface.height = 0;
		}
	};
}
