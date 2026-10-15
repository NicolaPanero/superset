interface Impulse {
	x: number;
	y: number;
	start: number;
}

const MAX_PIXELS = 1_200_000;
const MAX_IMPULSES = 6;
const IMPULSE_DURATION = 6500;
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
	const impulses: Impulse[] = [];
	let width = 0;
	let height = 0;
	let scale = 1;
	let frame = 0;
	let timer = 0;
	let disposed = false;
	let focused = document.hasFocus();
	let visible = true;
	let pixels: ImageData;
	let foreground = "";
	const start = performance.now();

	function stop() {
		cancelAnimationFrame(frame);
		window.clearTimeout(timer);
		frame = 0;
		timer = 0;
	}

	const draw = (now: number) => {
		if (!width || !height) return;
		while (impulses[0] && now - impulses[0].start > IMPULSE_DURATION)
			impulses.shift();
		const time = motion.matches ? 0 : (now - start) / 1000;
		const data = pixels.data;
		for (let row = 0; row < field.height; row++) {
			const y = ((row + 0.5) / field.height) * height;
			for (let column = 0; column < field.width; column++) {
				const x = ((column + 0.5) / field.width) * width;
				const drift =
					Math.sin(x * 0.005 + time * 0.14 + Math.sin(y * 0.004)) +
					Math.cos(y * 0.006 - time * 0.11 + x * 0.002);
				let energy = 0.022 + Math.max(0, drift - 0.35) * 0.035;
				for (const impulse of impulses) {
					const age = (now - impulse.start) / 1000;
					const dx = x - impulse.x;
					const dy = y - impulse.y;
					const distance = Math.sqrt(dx * dx + dy * dy);
					const angle = Math.atan2(dy, dx);
					const radius = age * 235;
					const distortion = Math.sin(angle * 5 + age * 1.8) * age * 9;
					const edge = (distance - radius + distortion) / (28 + age * 19);
					energy += Math.exp(-edge * edge - age * 0.62) * 0.95;
				}
				const centerX =
					(x - width / 2) / Math.max(1, Math.min(450, width * 0.28));
				const centerY = (y - height * 0.45) / Math.max(1, height * 0.75);
				const quiet = 1 - Math.exp(-(centerX ** 4 + centerY ** 4) * 1.5) * 0.94;
				const index = (row * field.width + column) * 4;
				data[index] = 255;
				data[index + 1] = 255;
				data[index + 2] = 255;
				data[index + 3] = Math.min(200, energy * quiet * 255);
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
	};

	function schedule() {
		stop();
		if (disposed || !visible || !focused || document.hidden || motion.matches)
			return;
		timer = window.setTimeout(
			() => {
				frame = requestAnimationFrame((now) => {
					draw(now);
					schedule();
				});
			},
			impulses.length ? 1000 / 30 : 1000 / 6,
		);
	}

	const resize = () => {
		const bounds = host.getBoundingClientRect();
		width = Math.round(bounds.width);
		height = Math.round(bounds.height);
		if (!width || !height) return;
		scale = Math.min(
			window.devicePixelRatio || 1,
			1.5,
			Math.sqrt(MAX_PIXELS / (width * height)),
		);
		for (const surface of [canvas, texture, layer]) {
			surface.width = Math.max(1, Math.round(width * scale));
			surface.height = Math.max(1, Math.round(height * scale));
		}
		field.width = Math.min(128, Math.ceil(width / 18));
		field.height = Math.min(96, Math.ceil(height / 18));
		pixels = fieldContext.createImageData(field.width, field.height);
		foreground = getComputedStyle(canvas).color;
		textureContext.setTransform(scale, 0, 0, scale, 0, 0);
		textureContext.font = "9px Menlo, Consolas, monospace";
		textureContext.textBaseline = "middle";
		const gradient = textureContext.createLinearGradient(0, 0, width, height);
		gradient.addColorStop(0, foreground);
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
		impulses.length = 0;
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
		if (impulses.length >= MAX_IMPULSES) impulses.shift();
		impulses.push({
			x: event.clientX - bounds.left,
			y: event.clientY - bounds.top,
			start: performance.now(),
		});
		schedule();
	}

	function onVisibility() {
		impulses.length = 0;
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
		impulses.length = 0;
		draw(performance.now());
		schedule();
	}
	const resizeObserver = new ResizeObserver(resize);
	resizeObserver.observe(host);
	const intersectionObserver = new IntersectionObserver(([entry]) => {
		visible = entry?.isIntersecting ?? false;
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
