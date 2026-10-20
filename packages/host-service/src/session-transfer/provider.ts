import {
	buildTerminalSessionHandoffPrompt,
	TRANSCRIPT_TRUNCATION_NOTICE,
} from "@superset/shared/terminal-session-handoff";
import type { TransferAgent } from "./registry";

export interface TransferInput {
	sourceAgent: TransferAgent;
	sourceSessionId: string;
	sourceTerminalId: string;
	sourceAgentLabel?: string;
	sourceRoot: string;
	sourceReference: string;
	targetAgent: TransferAgent;
	targetRoot: string;
	cwd: string;
	transcript?: string;
	signal?: AbortSignal;
}

export type TransferResult =
	| {
			mode: "native";
			targetSessionId: string;
			reference: string;
			cwd: string;
			messageCount: number;
			warnings: string[];
	  }
	| {
			mode: "context";
			prompt: string;
			cwd: string;
			warnings: string[];
	  };

export interface SessionTransferProvider<Input = TransferInput> {
	id: "native" | "context";
	isAvailable(): Promise<boolean>;
	canTransfer(source: TransferAgent, target: TransferAgent): Promise<boolean>;
	transfer(input: Input): Promise<TransferResult>;
}

export type ContextTransferInput = Pick<
	TransferInput,
	"cwd" | "transcript" | "sourceAgentLabel" | "sourceTerminalId"
>;

export class ContextTransferProvider
	implements SessionTransferProvider<ContextTransferInput>
{
	readonly id = "context";
	async isAvailable() {
		return true;
	}
	async canTransfer() {
		return true;
	}
	async transfer(input: ContextTransferInput): Promise<TransferResult> {
		if (!input.transcript?.trim()) throw new Error("context_unavailable");
		return {
			mode: "context",
			cwd: input.cwd,
			prompt: buildTerminalSessionHandoffPrompt({
				transcript: input.transcript,
				sourceAgentLabel: input.sourceAgentLabel,
				sourceTerminalId: input.sourceTerminalId,
			}),
			warnings: input.transcript.includes(TRANSCRIPT_TRUNCATION_NOTICE)
				? ["Earlier context was omitted."]
				: [],
		};
	}
}
