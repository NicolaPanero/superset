import { createHash, randomUUID } from "node:crypto";
import {
	linkSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export interface IsolatedAccount {
	agent: "claude" | "codex";
	selection: string;
	credentialKind: "subscription" | "api_key";
	identity: string | null;
	email: string | null;
}

export class ForkAccountRegistry {
	constructor(private directory: string) {}

	private file(account: Pick<IsolatedAccount, "agent" | "selection">) {
		const id = createHash("sha256")
			.update(JSON.stringify([account.agent, account.selection]))
			.digest("hex");
		return join(this.directory, `${id}.json`);
	}

	list(): IsolatedAccount[] {
		let files: string[];
		try {
			files = readdirSync(this.directory);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}
		return files
			.filter((file) => /^[a-f0-9]{64}\.json$/.test(file))
			.sort()
			.slice(0, 128)
			.map((file) => {
				const path = join(this.directory, file);
				if (statSync(path).size > 8192)
					throw new Error("account_registry_invalid");
				const row = JSON.parse(readFileSync(path, "utf8")) as IsolatedAccount;
				if (
					(row.agent !== "claude" && row.agent !== "codex") ||
					typeof row.selection !== "string" ||
					!isAbsolute(row.selection) ||
					row.selection.length > 4096 ||
					(row.credentialKind !== "subscription" &&
						row.credentialKind !== "api_key") ||
					!(
						row.identity === null ||
						(typeof row.identity === "string" &&
							/^[a-f0-9]{64}$/.test(row.identity))
					) ||
					!(
						row.email === null ||
						(typeof row.email === "string" && row.email.length <= 320)
					) ||
					this.file(row) !== path
				)
					throw new Error("account_registry_invalid");
				return row;
			});
	}

	remember(account: IsolatedAccount): IsolatedAccount {
		const rows = this.list();
		const saved = rows.find(
			(row) =>
				row.agent === account.agent && row.selection === account.selection,
		);
		if (saved) return saved;
		if (rows.length >= 128) throw new Error("account_registry_limit");
		mkdirSync(this.directory, { recursive: true, mode: 0o700 });
		const file = this.file(account);
		const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
		try {
			writeFileSync(temporary, JSON.stringify(account), { mode: 0o600 });
			try {
				linkSync(temporary, file);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			}
		} finally {
			unlinkSync(temporary);
		}
		return (
			this.list().find(
				(row) =>
					row.agent === account.agent && row.selection === account.selection,
			) ?? account
		);
	}

	forget(agent: IsolatedAccount["agent"], selection: string): void {
		try {
			unlinkSync(this.file({ agent, selection }));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
}

export function forkAccountRegistry() {
	const home =
		process.env.SUPERSET_HOME_DIR?.trim() || join(homedir(), ".superset");
	return new ForkAccountRegistry(join(home, "fork", "accounts"));
}
