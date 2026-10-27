interface AgentConfigRef {
	id: string;
	presetId: string;
}

/** Chats saved without their config id ask for the preset id instead. */
export function forkSwitchTarget<T extends AgentConfigRef>(
	configs: readonly T[],
	configId: string | undefined,
	chatConfig: T | undefined,
): T | undefined {
	if (!configId) return undefined;
	const exact = configs.find((config) => config.id === configId);
	if (exact) return exact;
	if (chatConfig?.presetId === configId) return chatConfig;
	return configs.find((config) => config.presetId === configId);
}
