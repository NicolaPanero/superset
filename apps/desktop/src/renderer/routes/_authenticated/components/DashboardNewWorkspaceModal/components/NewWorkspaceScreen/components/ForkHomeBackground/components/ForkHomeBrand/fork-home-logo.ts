const LOGO_PATHS = [
	"M2 5h4v2H4v2H2v4h2v2h2v2H2v-4H0V9h2V5Z",
	"M7 5h3v2H9v2H7v4h2v2h1v2H7v-4H5V9h2V5Z",
	"M12 5h3v4h2v4h-2v4h-3v-2h1v-2h2V9h-2V7h-1V5Z",
	"M16 5h4v4h2v4h-2v4h-4v-2h2v-2h2V9h-2V7h-2V5Z",
	"M10 8h2v2h2v2h-2v2h-2v-2H8v-2h2V8Z",
];

export function drawForkHomeLogo(canvas: HTMLCanvasElement) {
	const context = canvas.getContext("2d");
	if (!context) return;
	const scale = Math.min(window.devicePixelRatio || 1, 2);
	canvas.width = 320 * scale;
	canvas.height = 200 * scale;
	context.scale(scale, scale);
	const paths = LOGO_PATHS.map((path) => new Path2D(path));
	const gradient = context.createLinearGradient(0, 0, 320, 160);
	gradient.addColorStop(0, "#63b7ed");
	gradient.addColorStop(0.5, getComputedStyle(canvas).color);
	gradient.addColorStop(1, "#55c9bc");
	context.fillStyle = gradient;
	context.font = "8px Menlo, Consolas, monospace";
	context.textAlign = "center";
	context.textBaseline = "middle";
	const characters = "SUPERSET++01<>/{}";
	for (let row = 0; row < 20; row++) {
		for (let column = 0; column < 64; column++) {
			const x = ((column + 0.5) / 64) * 22;
			const y = 4 + ((row + 0.5) / 20) * 14;
			if (
				!paths.some((path) => context.isPointInPath(path, x * scale, y * scale))
			)
				continue;
			context.globalAlpha = 0.66 + ((column * 7 + row * 3) % 7) * 0.05;
			context.fillText(
				characters[(column + row * 3) % characters.length] ?? "+",
				column * 5 + 2.5,
				row * 10 + 5,
			);
		}
	}
}
