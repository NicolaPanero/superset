import { createHash, randomUUID } from "node:crypto";
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { resolveSupersetHomeDir } from "@superset/agent-setup";
import { z } from "zod";

const schema = z.object({
	identity: z.string().regex(/^[a-f0-9]{64}$/),
	idempotencyKey: z.string().uuid(),
	creditId: z.string().min(1).max(512).optional(),
	at: z.number().nonnegative(),
	submitted: z.boolean().optional(),
	outcome: z
		.enum(["reset", "alreadyRedeemed", "nothingToReset", "noCredit"])
		.optional(),
});
export type SavedResetAttempt = z.infer<typeof schema>;

export class ResetAttemptLedger {
	constructor(private directory: string) {}
	private file(selection: string) {
		return join(
			this.directory,
			`${createHash("sha256").update(selection).digest("hex")}.json`,
		);
	}
	load(selection: string, now: number): SavedResetAttempt | undefined {
		const file = this.file(selection);
		try {
			if (statSync(file).size > 4096) throw new Error("reset_attempt_invalid");
			const saved = schema.parse(JSON.parse(readFileSync(file, "utf8")));
			if (now - saved.at >= 86_400_000) {
				unlinkSync(file);
				return undefined;
			}
			return saved;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		}
	}
	save(selection: string, attempt: SavedResetAttempt, now: number) {
		mkdirSync(this.directory, { recursive: true, mode: 0o700 });
		const files = readdirSync(this.directory).filter((file) =>
			/^[a-f0-9]{64}\.json$/.test(file),
		);
		for (const file of files) {
			const path = join(this.directory, file);
			if (statSync(path).size > 4096) throw new Error("reset_attempt_invalid");
			const saved = schema.parse(JSON.parse(readFileSync(path, "utf8")));
			if (now - saved.at >= 86_400_000) unlinkSync(path);
		}
		const remaining = readdirSync(this.directory).filter((file) =>
			/^[a-f0-9]{64}\.json$/.test(file),
		);
		if (
			!remaining.includes(basename(this.file(selection))) &&
			remaining.length >= 128
		)
			throw new Error("reset_attempt_capacity");
		const temporary = `${this.file(selection)}.${randomUUID()}.tmp`;
		try {
			writeFileSync(temporary, JSON.stringify(schema.parse(attempt)), {
				mode: 0o600,
			});
			renameSync(temporary, this.file(selection));
		} finally {
			try {
				unlinkSync(temporary);
			} catch {}
		}
	}
}
export function resetAttemptLedger() {
	return new ResetAttemptLedger(
		join(resolveSupersetHomeDir(), "fork", "reset-attempts"),
	);
}
