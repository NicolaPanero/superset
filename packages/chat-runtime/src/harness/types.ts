import type {
	Decision,
	Delta,
	DiscoverSessionsResult,
	Item,
	SessionState,
	Turn,
	UserContent,
} from "@superset/chat/protocol";

export type AdapterEvent =
	| { kind: "item"; item: Item; turnId: string }
	| { kind: "delta"; delta: Delta }
	| { kind: "turn"; turn: Turn }
	| { kind: "session"; session: Partial<SessionState> };

export type HarnessMcpServer =
	| {
			transport: "stdio";
			name: string;
			command: string;
			args: string[];
			env: Record<string, string>;
	  }
	| {
			transport: "http" | "sse";
			name: string;
			url: string;
			headers: Record<string, string>;
	  };

export type HarnessStartOptions = {
	cwd: string;
	/** Folders the agent may use besides `cwd`, when the harness supports it. */
	additionalDirectories?: string[];
	/** Fork-managed MCP servers, sent to agents that take them per session. */
	mcpServers?: HarnessMcpServer[];
	modeId?: string;
	modelId?: string;
	forkEffort?: string;
	/** `quiet` loads the agent's history without replaying it as items. */
	resume?: { harnessSessionId: string; quiet?: boolean };
	strictResume?: boolean;
};

/** Asks a harness for its own history. Must not open a session. */
export type DiscoverNativeSessionsInput = {
	cwd: string;
	cursor?: string;
};

export interface HarnessAdapter {
	start(options: HarnessStartOptions): AsyncIterable<AdapterEvent>;
	prompt(content: UserContent[]): void;
	cancelTurn(): void;
	canSteer?(): boolean;
	/** Resolves false when the agent did not accept the prompt, so the caller queues it. */
	steer?(content: UserContent[]): Promise<boolean>;
	respondToApproval(approvalId: string, decision: Decision): void;
	setMode(modeId: string): void;
	setConfigOption?(configId: string, value: string): void;
	/**
	 * Branch this session, returning the harness id of the copy. Absent, or
	 * null, when the harness cannot: the agent has to advertise it.
	 */
	/** With `upToMessageId`, keeps the conversation only through that message, or returns null when it cannot. */
	fork?(cut?: { upToMessageId: string }): Promise<string | null>;
	forkOptions?(): { accountSelection?: string | null };
	stopBackgroundTask?(taskId: string): Promise<boolean>;
	/** The agent's context breakdown, when it can report one; never blocks a turn. */
	contextBreakdown?(): Promise<unknown | null>;
	steerSubagent?(taskId: string, content: UserContent[]): Promise<boolean>;
	backgroundSubagent?(taskId: string): Promise<boolean>;
	/**
	 * Lists the harness's own sessions. Absent when this harness has no native
	 * history. `supported: false` means the process answered but cannot list.
	 */
	discoverSessions?(
		input: DiscoverNativeSessionsInput,
	): Promise<DiscoverSessionsResult>;
	dispose(): Promise<void>;
}
