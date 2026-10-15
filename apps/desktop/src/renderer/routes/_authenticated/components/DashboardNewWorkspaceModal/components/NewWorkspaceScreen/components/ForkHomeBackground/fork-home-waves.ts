const STEP_SECONDS = 1 / 60;
const WAVE_SPEED = 230;

class WaveField {
	private current: Float32Array;
	private previous: Float32Array;
	private next: Float32Array;
	private damping: Float32Array;
	private horizontal: number;
	private vertical: number;
	peak = 0;

	constructor(
		readonly columns: number,
		readonly rows: number,
		private width: number,
		private height: number,
	) {
		this.current = new Float32Array(columns * rows);
		this.previous = new Float32Array(columns * rows);
		this.next = new Float32Array(columns * rows);
		this.damping = new Float32Array(columns * rows);
		this.horizontal =
			((WAVE_SPEED * STEP_SECONDS) / Math.max(12, width / (columns - 1))) ** 2;
		this.vertical =
			((WAVE_SPEED * STEP_SECONDS) / Math.max(12, height / (rows - 1))) ** 2;
		for (let row = 0; row < rows; row++) {
			for (let column = 0; column < columns; column++) {
				const edge = Math.min(
					column,
					row,
					columns - column - 1,
					rows - row - 1,
				);
				this.damping[row * columns + column] =
					0.86 + Math.min(1, edge / 6) * 0.136;
			}
		}
	}

	pulse(x: number, y: number, amplitude: number, radius: number) {
		for (let row = 1; row < this.rows - 1; row++) {
			const dy = (row * this.height) / (this.rows - 1) - y;
			if (Math.abs(dy) > radius * 2) continue;
			for (let column = 1; column < this.columns - 1; column++) {
				const dx = (column * this.width) / (this.columns - 1) - x;
				if (Math.abs(dx) > radius * 2) continue;
				const index = row * this.columns + column;
				const current = this.current[index] ?? 0;
				const next = Math.min(
					3,
					current +
						Math.exp(-(dx * dx + dy * dy) / (radius * radius)) * amplitude,
				);
				this.current[index] = next;
				this.previous[index] = (this.previous[index] ?? 0) + next - current;
				this.peak = Math.max(this.peak, Math.abs(next));
			}
		}
	}

	step() {
		let peak = 0;
		for (let row = 1; row < this.rows - 1; row++) {
			for (let column = 1; column < this.columns - 1; column++) {
				const index = row * this.columns + column;
				const value = this.current[index] ?? 0;
				const horizontal =
					(this.current[index - 1] ?? 0) +
					(this.current[index + 1] ?? 0) -
					2 * value;
				const vertical =
					(this.current[index - this.columns] ?? 0) +
					(this.current[index + this.columns] ?? 0) -
					2 * value;
				const next =
					(2 * value -
						(this.previous[index] ?? 0) +
						horizontal * this.horizontal +
						vertical * this.vertical) *
					(this.damping[index] ?? 0);
				this.next[index] = next;
				peak = Math.max(peak, Math.abs(next));
			}
		}
		const previous = this.previous;
		this.previous = this.current;
		this.current = this.next;
		this.next = previous;
		this.peak = peak;
	}

	sample(x: number, y: number) {
		const column = Math.max(
			0,
			Math.min(this.columns - 1.001, (x / this.width) * (this.columns - 1)),
		);
		const row = Math.max(
			0,
			Math.min(this.rows - 1.001, (y / this.height) * (this.rows - 1)),
		);
		const left = Math.floor(column);
		const top = Math.floor(row);
		const dx = column - left;
		const dy = row - top;
		const index = top * this.columns + left;
		const upper =
			(this.current[index] ?? 0) * (1 - dx) +
			(this.current[index + 1] ?? 0) * dx;
		const lower =
			(this.current[index + this.columns] ?? 0) * (1 - dx) +
			(this.current[index + this.columns + 1] ?? 0) * dx;
		return Math.min(1, Math.abs(upper * (1 - dy) + lower * dy) * 2.5);
	}

	clear() {
		this.current.fill(0);
		this.previous.fill(0);
		this.next.fill(0);
		this.peak = 0;
	}
}

export class ForkHomeWaves {
	readonly columns: number;
	readonly rows: number;
	private ambient: WaveField;
	private interaction: WaveField;
	private last: number;
	private elapsed = 0;
	private nextAmbient: number;

	constructor(
		readonly width: number,
		readonly height: number,
		now: number,
		private random = Math.random,
	) {
		this.columns = Math.max(3, Math.min(128, Math.ceil(width / 18) + 1));
		this.rows = Math.max(3, Math.min(96, Math.ceil(height / 18) + 1));
		this.ambient = new WaveField(this.columns, this.rows, width, height);
		this.interaction = new WaveField(this.columns, this.rows, width, height);
		this.last = now;
		this.nextAmbient = now + 1800;
		this.ambient.pulse(width * 0.15, height * 0.3, 0.9, 75);
		this.ambient.pulse(width * 0.85, height * 0.7, 0.9, 75);
		for (let step = 0; step < 36; step++) this.ambient.step();
	}

	get active() {
		return this.interaction.peak > 0.004;
	}

	advance(now: number) {
		this.elapsed += Math.min(0.25, Math.max(0, (now - this.last) / 1000));
		this.last = now;
		if (now >= this.nextAmbient) {
			const side = this.random() < 0.5 ? 0.1 : 0.9;
			this.ambient.pulse(
				this.width * side,
				this.height * (0.15 + this.random() * 0.7),
				0.9,
				55 + this.random() * 40,
			);
			this.nextAmbient = now + 1800 + this.random() * 1600;
		}
		while (this.elapsed >= STEP_SECONDS) {
			this.ambient.step();
			if (this.active) this.interaction.step();
			this.elapsed -= STEP_SECONDS;
		}
	}

	click(x: number, y: number) {
		this.interaction.pulse(x, y, 0.95, 32);
	}

	sampleAmbient(x: number, y: number) {
		return this.ambient.sample(x, y);
	}

	sampleInteraction(x: number, y: number) {
		return this.interaction.sample(x, y);
	}

	resume(now: number) {
		this.last = now;
	}

	clearInteraction() {
		this.interaction.clear();
	}
}
