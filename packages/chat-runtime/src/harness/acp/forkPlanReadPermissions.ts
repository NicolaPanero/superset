import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import type { AcpRequestPermissionParams } from "./wire";

type Token = { word: string } | { operator: string };
type Command = { words: string[]; after?: string };

function parseCommands(source: string): Command[] | null {
	if (source.length > 32_768) return null;
	const tokens: Token[] = [];
	let word = "";
	let started = false;
	let quote = "";
	const flush = () => {
		if (started) tokens.push({ word });
		word = "";
		started = false;
	};
	for (let i = 0; i < source.length; i++) {
		const char = source[i] as string;
		const code = char.charCodeAt(0);
		if ((code < 32 && char !== "\t" && char !== "\n") || code === 127)
			return null;
		if (quote === "'") {
			if (char === "'") quote = "";
			else word += char;
			continue;
		}
		if (char === "\\") {
			const next = source[++i];
			if (!next || next === "\n") return null;
			if (quote === '"' && !/[\\"$`]/.test(next)) word += "\\";
			word += next;
			started = true;
			continue;
		}
		if (quote === '"') {
			if (char === '"') quote = "";
			else if (char === "$" || char === "`") return null;
			else word += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			started = true;
		} else if (char === " " || char === "\t") flush();
		else if (char === ";" || char === "\n" || char === "|") {
			flush();
			if (char === "|" && /[|&]/.test(source[i + 1] ?? "")) return null;
			tokens.push({ operator: char === "\n" ? ";" : char });
		} else if (char === "&" && source[i + 1] === "&") {
			flush();
			tokens.push({ operator: "&&" });
			i++;
		} else if (/[&<>()[\]{}*?~$`!#]/.test(char)) return null;
		else {
			word += char;
			started = true;
		}
	}
	if (quote) return null;
	flush();
	const commands: Command[] = [];
	let words: string[] = [];
	for (const token of tokens) {
		if ("word" in token) words.push(token.word);
		else {
			if (words.length === 0) return null;
			commands.push({ words, after: token.operator });
			words = [];
		}
	}
	if (words.length) commands.push({ words });
	else if (commands.at(-1)?.after !== ";") return null;
	return commands.length ? commands : null;
}

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

type SearchOptions = {
	short: string;
	long: string[];
	values?: string[];
};

const SEARCH_OPTIONS: Record<string, SearchOptions> = {
	grep: {
		short: "EFGivwnHhloqsrc",
		long: [
			"line-number",
			"ignore-case",
			"fixed-strings",
			"files-with-matches",
			"recursive",
		],
	},
	rg: {
		short: "nNiIloqsvwFxSHUua",
		long: [
			"files",
			"hidden",
			"no-ignore",
			"no-ignore-vcs",
			"line-number",
			"ignore-case",
			"smart-case",
			"fixed-strings",
			"files-with-matches",
			"files-without-match",
			"count",
			"column",
			"no-heading",
			"heading",
			"stats",
			"only-matching",
			"multiline",
			"no-messages",
			"no-config",
		],
		values: [
			"-g",
			"--glob",
			"-t",
			"--type",
			"-T",
			"--type-not",
			"--max-count",
			"--max-depth",
			"-m",
			"-A",
			"-B",
			"-C",
			"--context",
			"--before-context",
			"--after-context",
		],
	},
};

export class ForkPlanReadPermissions {
	constructor(private readonly cwd: string) {}

	private path(path: string, cwd = this.cwd): string | null {
		if (!path || path.includes("\0") || path.split(/[\\/]/).includes(".."))
			return null;
		try {
			const root = realpathSync.native(this.cwd);
			const target = realpathSync.native(
				isAbsolute(path) ? path : `${cwd}${sep}${path}`,
			);
			const stat = statSync(target);
			if (!stat.isFile() && !stat.isDirectory()) return null;
			const fromRoot = relative(root, target);
			if (
				fromRoot === ".." ||
				fromRoot.startsWith(`..${sep}`) ||
				isAbsolute(fromRoot)
			)
				return null;
			return target;
		} catch {
			return null;
		}
	}

	private paths(paths: string[], cwd: string, anchored: boolean): boolean {
		return paths.every(
			(path) =>
				path === "-" ||
				((anchored || isAbsolute(path)) && this.path(path, cwd) !== null),
		);
	}

	private search(
		name: string,
		args: string[],
		cwd: string,
		anchored: boolean,
	): boolean {
		const options = SEARCH_OPTIONS[name];
		if (!options) return false;
		const operands: string[] = [];
		let pattern = false;
		let files = false;
		let endOptions = false;
		for (let i = 0; i < args.length; i++) {
			const arg = args[i] as string;
			if (endOptions || !arg.startsWith("-") || arg === "-") operands.push(arg);
			else if (arg === "--") endOptions = true;
			else if (arg === "-e" || arg === "--regexp") {
				if (args[++i] === undefined) return false;
				pattern = true;
			} else if (options.values?.includes(arg)) {
				if (args[++i] === undefined) return false;
			} else if (arg.startsWith("--")) {
				if (!options.long.includes(arg.slice(2))) return false;
				if (arg === "--files") files = true;
			} else if (!new RegExp(`^-[${options.short}]+$`).test(arg)) return false;
		}
		if (!files && !pattern && operands.shift() === undefined) return false;
		if (!anchored && name === "rg" && operands.length === 0) return false;
		if (
			!anchored &&
			name === "grep" &&
			args.some((arg) => /^-[^-]*r/.test(arg) || arg === "--recursive") &&
			operands.length === 0
		)
			return false;
		return this.paths(operands, cwd, anchored);
	}

	private git(args: string[], cwd: string): boolean {
		if (args[0] === "--no-pager") args = args.slice(1);
		if (args[0] === "-C") {
			const target = this.path(args[1] ?? "", cwd);
			if (!target) return false;
			cwd = target;
			args = args.slice(2);
		}
		const [subcommand, ...rest] = args;
		if (!subcommand || !["status", "diff", "log"].includes(subcommand))
			return false;
		let paths = false;
		for (let i = 0; i < rest.length; i++) {
			const arg = rest[i] as string;
			if (paths) {
				if (!this.path(arg, cwd)) return false;
			} else if (arg === "--") paths = true;
			else if (subcommand === "status") {
				if (
					!/^(--short|--branch|--porcelain(?:=v[12])?|--untracked-files(?:=(?:no|normal|all))?|-[sb]+|-u(?:no|normal|all)?)$/.test(
						arg,
					)
				)
					return false;
			} else if (subcommand === "diff") {
				if (
					!/^(--(?:stat|numstat|shortstat|name-only|name-status|cached|staged|check|no-ext-diff|no-textconv|exit-code|quiet)|-U\d+|--unified=\d+)$/.test(
						arg,
					) &&
					(arg.startsWith("-") || !/^[\w./@~^:-]+$/.test(arg))
				)
					return false;
			} else if (arg === "-n" || arg === "--max-count") {
				if (!/^\d+$/.test(rest[++i] ?? "")) return false;
			} else if (
				!/^(--(?:oneline|all|graph|no-decorate|no-patch)|--decorate(?:=(?:short|full|no))?|--max-count=\d+|-\d+)$/.test(
					arg,
				) &&
				(arg.startsWith("-") || !/^[\w./@~^:-]+$/.test(arg))
			)
				return false;
		}
		if (subcommand === "diff") {
			const separator = rest.indexOf("--");
			const options = separator < 0 ? rest : rest.slice(0, separator);
			const summary = options.some((arg) =>
				/^(--(?:stat|numstat|shortstat|name-only|name-status|check))$/.test(
					arg,
				),
			);
			const patch = options.some((arg) =>
				/^(?:-U|--unified=|--quiet$)/.test(arg),
			);
			return (
				(summary && !patch) ||
				(options.includes("--no-ext-diff") && options.includes("--no-textconv"))
			);
		}
		return true;
	}

	private command(words: string[], cwd: string, anchored: boolean): boolean {
		const [name, ...args] = words;
		if (name === "pwd") return args.length === 0;
		if (name === "git") return anchored && this.git(args, cwd);
		if (name === "rg" || name === "grep")
			return this.search(name, args, cwd, anchored);
		if (name === "sed") {
			return (
				args[0] === "-n" &&
				/^\d+(?:,\d+|,\$)?p$/.test(args[1] ?? "") &&
				args.slice(2).every((path) => !path.startsWith("-")) &&
				this.paths(args.slice(2), cwd, anchored)
			);
		}
		const flags: Record<string, RegExp> = {
			ls: /^-[aAldhtrSR1]+$/,
			cat: /^-[benstuvETA]+$/,
			wc: /^-[lwmcL]+$/,
			head: /^-\d+$/,
			tail: /^-\d+$/,
		};
		if (!name || !flags[name]) return false;
		if (!anchored && name === "ls" && args.every((arg) => arg.startsWith("-")))
			return false;
		const paths: string[] = [];
		let endOptions = false;
		for (let i = 0; i < args.length; i++) {
			const arg = args[i] as string;
			if (endOptions || !arg.startsWith("-") || arg === "-") paths.push(arg);
			else if (arg === "--") endOptions = true;
			else if (
				(name === "head" || name === "tail") &&
				(arg === "-n" || arg === "-c")
			) {
				if (!/^\d+$/.test(args[++i] ?? "")) return false;
			} else if (!flags[name]?.test(arg)) return false;
		}
		return this.paths(paths, cwd, anchored);
	}

	private shell(source: string): boolean {
		const commands = parseCommands(source);
		if (!commands) return false;
		let cwd = this.path(".");
		if (!cwd) return false;
		// Bash retains its working directory across calls; relative paths need an explicit anchor.
		let anchored = false;
		for (let i = 0; i < commands.length; i++) {
			const command = commands[i] as Command;
			if (command.words[0] === "cd") {
				if (
					i !== 0 ||
					command.words.length !== 2 ||
					!isAbsolute(command.words[1] ?? "") ||
					command.after !== "&&"
				)
					return false;
				const target = this.path(command.words[1] ?? "", cwd);
				if (!target || !statSync(target).isDirectory()) return false;
				cwd = target;
				anchored = true;
			} else if (!this.command(command.words, cwd, anchored)) return false;
		}
		return true;
	}

	allowOption(
		request: AcpRequestPermissionParams,
		toolName: string | undefined,
	): string | undefined {
		try {
			return this.readOption(request, toolName);
		} catch {
			return undefined;
		}
	}

	private readOption(
		request: AcpRequestPermissionParams,
		toolName: string | undefined,
	): string | undefined {
		const input = record(request.toolCall?.rawInput);
		if (!input) return undefined;
		let allowed = false;
		if (toolName === "Read" && typeof input.file_path === "string") {
			allowed = this.path(input.file_path) !== null;
		} else if (toolName === "Grep" || toolName === "Glob") {
			allowed =
				typeof input.pattern === "string" &&
				(input.path === undefined || typeof input.path === "string") &&
				this.path(typeof input.path === "string" ? input.path : ".") !== null;
			if (toolName === "Glob") {
				allowed &&=
					typeof input.pattern === "string" &&
					!isAbsolute(input.pattern) &&
					!input.pattern.includes("..") &&
					!input.pattern.includes("\0") &&
					!/[{}\\~]/.test(input.pattern);
			}
		} else if (toolName === "Bash" && typeof input.command === "string") {
			allowed =
				input.run_in_background !== true &&
				input.dangerouslyDisableSandbox !== true &&
				this.shell(input.command);
		}
		return allowed
			? request.options.find((option) => option.kind === "allow_once")?.optionId
			: undefined;
	}
}
