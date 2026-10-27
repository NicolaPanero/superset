import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { type MenuItemConstructorOptions, powerSaveBlocker } from "electron";
import { SUPERSET_HOME_DIR } from "./app-environment";
import {
	type ForkKeepAwakeBinding,
	type ForkKeepAwakeMode,
	isAnyAgentWorking,
	parseForkKeepAwakeMode,
	shouldKeepAwake,
} from "./fork-keep-awake-state";
import { getHostServiceCoordinator } from "./host-service-coordinator";

const POLL_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 5_000;
const SETTINGS_PATH = join(SUPERSET_HOME_DIR, "fork", "keep-awake.json");

let mode: ForkKeepAwakeMode = "agents";
let agentsWorking = false;
let blockerId: number | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let polling = false;
let notifyChange: () => void = () => {};

function readMode(): ForkKeepAwakeMode {
	try {
		return parseForkKeepAwakeMode(readFileSync(SETTINGS_PATH, "utf8"));
	} catch {
		return parseForkKeepAwakeMode(null);
	}
}

function writeMode(next: ForkKeepAwakeMode): void {
	try {
		mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
		writeFileSync(SETTINGS_PATH, `${JSON.stringify({ mode: next })}\n`);
	} catch (error) {
		console.warn("[fork-keep-awake] Failed to save mode:", error);
	}
}

async function fetchBindings(
	port: number,
	secret: string,
): Promise<ForkKeepAwakeBinding[]> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(
			`http://127.0.0.1:${port}/trpc/terminalAgents.list`,
			{
				headers: { Authorization: `Bearer ${secret}` },
				signal: controller.signal,
			},
		);
		if (!res.ok) return [];
		const data = await res.json();
		const bindings = data?.result?.data?.json;
		return Array.isArray(bindings) ? bindings : [];
	} catch {
		return [];
	} finally {
		clearTimeout(timeout);
	}
}

async function readAgentsWorking(): Promise<boolean> {
	const coordinator = getHostServiceCoordinator();
	const results = await Promise.all(
		coordinator.getActiveOrganizationIds().map((organizationId) => {
			const connection = coordinator.getConnection(organizationId);
			return connection
				? fetchBindings(connection.port, connection.secret)
				: [];
		}),
	);
	return isAnyAgentWorking(results.flat(), Date.now());
}

function apply(): void {
	const keepAwake = shouldKeepAwake(mode, agentsWorking);
	if (keepAwake === (blockerId !== null)) return;
	if (keepAwake) {
		blockerId = powerSaveBlocker.start("prevent-app-suspension");
	} else if (blockerId !== null) {
		powerSaveBlocker.stop(blockerId);
		blockerId = null;
	}
	notifyChange();
}

async function poll(): Promise<void> {
	if (polling || mode !== "agents") return;
	polling = true;
	try {
		agentsWorking = await readAgentsWorking();
		apply();
	} finally {
		polling = false;
	}
}

function schedulePolling(): void {
	if (mode === "agents" && !pollTimer) {
		pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
		void poll();
	} else if (mode !== "agents" && pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
		agentsWorking = false;
	}
}

function setMode(next: ForkKeepAwakeMode): void {
	if (next === mode) return;
	mode = next;
	writeMode(next);
	schedulePolling();
	apply();
	notifyChange();
}

export function setupForkKeepAwake(onChange: () => void): void {
	notifyChange = onChange;
	mode = readMode();
	schedulePolling();
	apply();
}

export function disposeForkKeepAwake(): void {
	if (pollTimer) clearInterval(pollTimer);
	pollTimer = null;
	if (blockerId !== null) powerSaveBlocker.stop(blockerId);
	blockerId = null;
}

function statusLabel(): string {
	return blockerId !== null
		? i18n._(msg({ message: "The Mac stays awake now" }))
		: i18n._(msg({ message: "The Mac can sleep now" }));
}

export function forkKeepAwakeToolTip(appName: string): string {
	return blockerId !== null ? `${appName} — ${statusLabel()}` : appName;
}

export function forkKeepAwakeMenuItem(): MenuItemConstructorOptions {
	const option = (
		value: ForkKeepAwakeMode,
		label: string,
	): MenuItemConstructorOptions => ({
		label,
		type: "radio",
		checked: mode === value,
		click: () => setMode(value),
	});
	return {
		label: i18n._(msg({ message: "Keep the Mac Awake" })),
		submenu: [
			option("off", i18n._(msg({ message: "Never", context: "keep awake" }))),
			option("agents", i18n._(msg({ message: "While Agents Work" }))),
			option(
				"always",
				i18n._(msg({ message: "Always", context: "keep awake" })),
			),
			{ type: "separator" },
			{ label: statusLabel(), enabled: false },
			{
				label: i18n._(
					msg({ message: "Closing the lid still puts the Mac to sleep" }),
				),
				enabled: false,
			},
		],
	};
}
