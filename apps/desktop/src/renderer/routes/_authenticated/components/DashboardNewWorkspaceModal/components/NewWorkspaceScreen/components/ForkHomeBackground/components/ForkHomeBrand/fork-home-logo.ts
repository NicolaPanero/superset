const LOGO_PATHS = [
	"M2 5h4v2H4v2H2v4h2v2h2v2H2v-4H0V9h2V5Z",
	"M7 5h3v2H9v2H7v4h2v2h1v2H7v-4H5V9h2V5Z",
	"M12 5h3v4h2v4h-2v4h-3v-2h1v-2h2V9h-2V7h-1V5Z",
	"M16 5h4v4h2v4h-2v4h-4v-2h2v-2h2V9h-2V7h-2V5Z",
	"M10 8h2v2h2v2h-2v2h-2v-2H8v-2h2V8Z",
];

export function createForkHomeLogo(canvas: HTMLCanvasElement) {
	const context = canvas.getContext("2d");
	const texture = document.createElement("canvas");
	const ink = texture.getContext("2d");
	const mask = document.createElement("canvas");
	const maskContext = mask.getContext("2d");
	if (!context || !ink || !maskContext) return;
	const scale = Math.min(window.devicePixelRatio || 1, 2);
	canvas.width = texture.width = 320 * scale;
	canvas.height = texture.height = 200 * scale;
	ink.scale(scale, scale);
	const paths = LOGO_PATHS.map((path) => new Path2D(path));
	const gradient = ink.createLinearGradient(0, 0, 320, 200);
	gradient.addColorStop(0, getComputedStyle(canvas).color);
	gradient.addColorStop(1, "#57c6b9");
	ink.fillStyle = gradient;
	ink.font = "8px Menlo, Consolas, monospace";
	ink.textAlign = "center";
	ink.textBaseline = "middle";
	const characters = "SUPERSET++01<>/{}";
	for (let row = 0; row < 20; row++) {
		for (let column = 0; column < 64; column++) {
			const x = ((column + 0.5) / 64) * 22;
			const y = 4 + ((row + 0.5) / 20) * 14;
			if (!paths.some((path) => ink.isPointInPath(path, x * scale, y * scale)))
				continue;
			ink.fillText(
				characters[(column + row * 3) % characters.length] ?? "+",
				column * 5 + 2.5,
				row * 10 + 5,
			);
		}
	}
	mask.width = 64;
	mask.height = 20;
	const pixels = maskContext.createImageData(mask.width, mask.height);
	pixels.data.fill(255);
	return {
		paint(sample: (x: number, y: number) => number) {
			for (let row = 0; row < mask.height; row++) {
				for (let column = 0; column < mask.width; column++) {
					pixels.data[(row * mask.width + column) * 4 + 3] =
						(0.14 +
							sample((column + 0.5) / mask.width, (row + 0.5) / mask.height) *
								0.82) *
						255;
				}
			}
			maskContext.putImageData(pixels, 0, 0);
			context.globalCompositeOperation = "source-over";
			context.clearRect(0, 0, canvas.width, canvas.height);
			context.drawImage(texture, 0, 0);
			context.globalCompositeOperation = "destination-in";
			context.drawImage(mask, 0, 0, canvas.width, canvas.height);
		},
		dispose() {
			texture.width = mask.width = 0;
			texture.height = mask.height = 0;
		},
	};
}
