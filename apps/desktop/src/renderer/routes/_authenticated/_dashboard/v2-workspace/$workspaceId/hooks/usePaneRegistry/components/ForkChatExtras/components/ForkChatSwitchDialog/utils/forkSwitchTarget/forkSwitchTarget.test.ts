import { expect, test } from "bun:test";
import { forkSwitchTarget } from "./forkSwitchTarget";

const claude = {
	id: "f287303b-377e-45ab-8e7f-33e2c216aac7",
	presetId: "claude",
};
const claudeOpus = {
	id: "0b8e6c1e-5f43-4d0a-9d7e-2b1f6f7a9c11",
	presetId: "claude",
};
const codex = { id: "3ad4cf41-48fb-4ba6-af03-ed65c803a7b7", presetId: "codex" };
const configs = [claude, claudeOpus, codex];

test("a config id selects that config", () => {
	expect(forkSwitchTarget(configs, codex.id, claude)).toBe(codex);
	expect(forkSwitchTarget(configs, claudeOpus.id, claude)).toBe(claudeOpus);
});

test("a chat saved without its config id moves accounts on its own config", () => {
	expect(forkSwitchTarget(configs, "claude", claudeOpus)).toBe(claudeOpus);
	expect(forkSwitchTarget(configs, "claude", undefined)).toBe(claude);
});

test("an unknown or missing id selects nothing", () => {
	expect(forkSwitchTarget(configs, "grok", claude)).toBeUndefined();
	expect(forkSwitchTarget(configs, undefined, claude)).toBeUndefined();
});
