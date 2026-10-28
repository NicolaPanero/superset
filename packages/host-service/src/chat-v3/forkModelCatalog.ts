import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { resolveSupersetHomeDir } from "@superset/agent-setup";
import type { SessionConfigOption } from "@superset/chat/protocol";
import {
	createAcpAdapter,
	type HarnessAdapter,
	type HarnessStartOptions,
} from "@superset/chat-runtime";
import { resolveAgentLaunchPresetId } from "@superset/shared/agent-models";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, workspaces } from "../db/schema";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../terminal-agents/agent-config";
import { acpHarnessForPreset } from "./acpCatalogue";
import { acpHarnessFactory } from "./acpHarnesses";
import { ForkCursorModelCatalogAdapter } from "./forkCursorModelCatalogAdapter";

export interface ForkModelCatalogInput {
	agent: string;
	accountSelection?: string | null;
	workspaceId?: string;
	projectId?: string;
	model?: string;
	refresh?: boolean;
}
export interface ForkModelCatalog {
	configOptions: SessionConfigOption[];
	modelConfigOptions?: Record<string, SessionConfigOption[]>;
	fetchedAt: number;
}
type Entry = {
	expires: number;
	value: Promise<ForkModelCatalog>;
	pending: boolean;
	/** The last catalog read, answered at once while a newer one loads. */
	settled?: ForkModelCatalog;
};
const caches = new WeakMap<HostDb, Map<string, Entry>>();
const FRESH_MS = 24 * 60 * 60_000;
const MAX_ENTRIES = 64;

/** Catalogs kept across host restarts, so the picker never starts empty. */
export interface ForkModelCatalogStore {
	read(key: string): ForkModelCatalog | undefined;
	write(key: string, catalog: ForkModelCatalog): void;
}

export function fileModelCatalogStore(
	file = () => join(resolveSupersetHomeDir(), "fork", "model-catalog.json"),
	maxAgeMs = 30 * 24 * 60 * 60_000,
	now = Date.now,
): ForkModelCatalogStore {
	let entries: Map<string, ForkModelCatalog> | undefined;
	const load = () => {
		if (entries) return entries;
		entries = new Map();
		try {
			const saved = JSON.parse(readFileSync(file(), "utf8")) as {
				entries?: Record<string, ForkModelCatalog>;
			};
			for (const [key, catalog] of Object.entries(saved.entries ?? {}))
				if (
					Array.isArray(catalog?.configOptions) &&
					typeof catalog.fetchedAt === "number" &&
					now() - catalog.fetchedAt < maxAgeMs
				)
					entries.set(key, catalog);
		} catch {}
		return entries;
	};
	return {
		read: (key) => load().get(key),
		write: (key, catalog) => {
			const saved = load();
			saved.delete(key);
			saved.set(key, catalog);
			while (saved.size > MAX_ENTRIES) {
				const oldest = saved.keys().next().value;
				if (oldest) saved.delete(oldest);
			}
			try {
				const path = file();
				mkdirSync(dirname(path), { recursive: true });
				const temporary = `${path}.${process.pid}.tmp`;
				writeFileSync(
					temporary,
					JSON.stringify({ entries: Object.fromEntries(saved) }),
					{ mode: 0o600 },
				);
				renameSync(temporary, path);
			} catch (error) {
				console.warn("[fork-model-catalog] failed to save the cache:", error);
			}
		},
	};
}
const defaultStore = fileModelCatalogStore();
let running = 0;
const waiting: Array<() => void> = [];
async function withProbeSlot<T>(probe: () => Promise<T>): Promise<T> {
	if (running >= 2) {
		if (waiting.length >= 8)
			throw new TRPCError({
				code: "TOO_MANY_REQUESTS",
				message: "Model discovery is busy. Try again shortly.",
			});
		await new Promise<void>((resolve) => waiting.push(resolve));
	} else running++;
	try {
		return await probe();
	} finally {
		const next = waiting.shift();
		if (next) next();
		else running--;
	}
}

export async function readForkModelCatalog(
	adapter: HarnessAdapter,
	options: HarnessStartOptions,
	timeoutMs = 15_000,
): Promise<SessionConfigOption[]> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let idleFallback: ReturnType<typeof setImmediate> | undefined;
	try {
		return await new Promise<SessionConfigOption[]>((resolve, reject) => {
			timer = setTimeout(
				() => reject(new Error("Model discovery timed out")),
				timeoutMs,
			);
			let idle = false;
			let configOptions: SessionConfigOption[] | undefined;
			const ready = () => {
				if (!idle || !configOptions) return;
				const current = configOptions.find(
					(o) => o.category === "model",
				)?.currentValue;
				if (
					options.modelId &&
					current !== options.modelId &&
					current !== options.modelId.split("[")[0]
				)
					return;
				resolve(configOptions);
			};
			void (async () => {
				try {
					for await (const event of adapter.start(options)) {
						if (
							event.kind === "item" &&
							event.item.kind === "notice" &&
							event.item.noticeKind === "error"
						)
							throw new Error(
								typeof event.item.text === "string"
									? event.item.text
									: "Model discovery failed",
							);
						if (event.kind !== "session") continue;
						if (event.session.status === "dead")
							throw new Error("Agent stopped during model discovery");
						if (event.session.status === "idle") {
							idle = true;
							if (!options.modelId)
								idleFallback = setImmediate(() => resolve(configOptions ?? []));
						}
						if (event.session.configOptions)
							configOptions = event.session.configOptions;
						ready();
					}
				} catch (error) {
					reject(error);
				}
			})();
		});
	} finally {
		clearTimeout(timer);
		clearImmediate(idleFallback);
		await adapter.dispose();
	}
}

export async function getForkModelCatalog(
	db: HostDb,
	input: ForkModelCatalogInput,
	createFactory: typeof acpHarnessFactory = acpHarnessFactory,
	store: ForkModelCatalogStore = defaultStore,
): Promise<ForkModelCatalog> {
	const config = resolveHostAgentConfig(db, input.agent);
	if (!config)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "agent_config_unavailable",
		});
	const preset = resolveAgentLaunchPresetId(config.presetId, config.command);
	const harness = acpHarnessForPreset(preset);
	if (!harness) return { configOptions: [], fetchedAt: Date.now() };
	const workspace = input.workspaceId
		? db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, input.workspaceId))
				.get()
		: undefined;
	const projectId = input.projectId ?? workspace?.projectId;
	const project = projectId
		? db.select().from(projects).where(eq(projects.id, projectId)).get()
		: undefined;
	if (
		(input.workspaceId && (!workspace || workspace.archivedAt)) ||
		(input.projectId && !project)
	)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "workspace_unavailable",
		});
	const cwd = workspace?.worktreePath ?? project?.repoPath ?? homedir();
	const cursor = harness === "cursor-acp";
	const selected = (catalog: ForkModelCatalog): ForkModelCatalog => {
		if (!cursor || !input.model || !catalog.modelConfigOptions) return catalog;
		const parameters = catalog.modelConfigOptions[input.model];
		if (!Object.hasOwn(catalog.modelConfigOptions, input.model) || !parameters)
			throw new TRPCError({
				code: "BAD_REQUEST",
				message:
					"The selected model is no longer available. Refresh the model list.",
			});
		return {
			...catalog,
			configOptions: catalog.configOptions
				.map((o) =>
					o.category === "model" ? { ...o, currentValue: input.model } : o,
				)
				.concat(parameters),
		};
	};
	// One catalog per agent and account for every workspace: probing starts the
	// agent, and its models do not depend on the folder.
	const key = createHash("sha256")
		.update(
			JSON.stringify([
				config,
				agentLaunchEnv(db, config),
				input.accountSelection ?? null,
				input.accountSelection === undefined,
				cursor ? null : input.model,
			]),
		)
		.digest("hex");
	let cache = caches.get(db);
	if (!cache) {
		cache = new Map();
		caches.set(db, cache);
	}
	let previous = cache.get(key);
	if (!previous) {
		const saved = store.read(key);
		if (saved) {
			previous = {
				expires: saved.fetchedAt + FRESH_MS,
				value: Promise.resolve(saved),
				pending: false,
				settled: saved,
			};
			cache.set(key, previous);
		}
	}
	if (previous && !input.refresh) {
		if (previous.pending && previous.settled)
			return Promise.resolve(previous.settled).then(selected);
		if (previous.pending || previous.expires > Date.now())
			return previous.value.then(selected);
	}
	if (previous?.pending) return previous.value.then(selected);
	const factory = createFactory(harness, db, undefined, (options) =>
		cursor
			? new ForkCursorModelCatalogAdapter(options)
			: createAcpAdapter(options),
	);
	if (!factory)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "acp_unavailable",
		});
	const value = withProbeSlot(async () => {
		const adapter = factory({
			sessionId: randomUUID(),
			scopeId: workspace?.id ?? "fork-model-catalog",
			harness,
			cwd,
			agentConfigId: config.id,
			accountSelection: input.accountSelection,
		});
		const configOptions = await readForkModelCatalog(adapter, {
			cwd,
			modelId: cursor ? undefined : input.model,
		});
		return {
			configOptions,
			fetchedAt: Date.now(),
			...(adapter instanceof ForkCursorModelCatalogAdapter
				? { modelConfigOptions: adapter.modelConfigOptions }
				: {}),
		};
	});
	const stale = previous?.settled;
	const entry: Entry = {
		expires: Date.now() + FRESH_MS,
		value,
		pending: true,
		...(stale ? { settled: stale } : {}),
	};
	cache.delete(key);
	cache.set(key, entry);
	while (cache.size > MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest) cache.delete(oldest);
	}
	void value.then(
		(catalog) => {
			entry.pending = false;
			entry.settled = catalog;
			store.write(key, catalog);
		},
		() => {
			entry.pending = false;
			entry.expires = Date.now() + 10_000;
			// A failed refresh keeps answering with the last good catalog.
			if (stale) entry.value = Promise.resolve(stale);
		},
	);
	// An expired catalog answers now; the probe above replaces it for later reads.
	if (stale && !input.refresh) return Promise.resolve(stale).then(selected);
	return value.then(selected);
}
