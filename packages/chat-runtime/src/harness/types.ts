import type {
	Decision,
	Delta,
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
	resume?: { harnessSessionId: string };
	strictResume?: boolean;
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
	fork?(point?: { messageId: string }): Promise<string | null>;
	forkOptions?(): { accountSelection?: string | null };
	stopBackgroundTask?(taskId: string): Promise<boolean>;
	/** The agent's context breakdown, when it can report one; never blocks a turn. */
	contextBreakdown?(): Promise<unknown | null>;
	dispose(): Promise<void>;
}
