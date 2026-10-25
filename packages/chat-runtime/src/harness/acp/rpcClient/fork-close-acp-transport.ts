import {
	type ForkAgentProcesses,
	killProcessGroup,
} from "../../forkAgentProcesses";

interface ForkAcpCloseProcess {
	pid?: number;
	stdin: { end(): unknown } | null;
	once(event: "close", listener: () => void): unknown;
	kill(signal: "SIGKILL"): boolean;
}

type Schedule = (callback: () => void, delayMs: number) => () => void;

const schedule: Schedule = (callback, delayMs) => {
	const timer = setTimeout(callback, delayMs);
	return () => clearTimeout(timer);
};

export function forkAcpTransportCloser(
	child: ForkAcpCloseProcess,
	processes: Pick<ForkAgentProcesses, "sample" | "reap" | "reapAndConfirm">,
	options: {
		graceMs?: number;
		confirmMs?: number;
		schedule?: Schedule;
		kill?: () => void;
	} = {},
): () => Promise<void> {
	let closed = false;
	const closeConfirmed = new Promise<void>((resolve) => {
		child.once("close", () => {
			closed = true;
			resolve();
		});
	});
	let closing: Promise<void> | undefined;
	const close = async () => {
		if (!closed) {
			await processes.sample({ strict: true });
			void processes.reap().catch(() => {});
			child.stdin?.end();
			await new Promise<void>((resolve, reject) => {
				const scheduleTimer = options.schedule ?? schedule;
				const graceMs = options.graceMs ?? 2000;
				let settled = false;
				let cancelKill = () => {};
				let cancelFailure = () => {};
				const finish = (error?: unknown) => {
					if (settled) return;
					settled = true;
					cancelKill();
					cancelFailure();
					if (error) reject(error);
					else resolve();
				};
				cancelKill = scheduleTimer(() => {
					try {
						if (options.kill) options.kill();
						else {
							killProcessGroup(child.pid);
							child.kill("SIGKILL");
						}
					} catch (error) {
						finish(error);
					}
				}, graceMs);
				cancelFailure = scheduleTimer(
					() => finish(new Error("ACP agent exit was not confirmed")),
					graceMs + (options.confirmMs ?? 2000),
				);
				void closeConfirmed.then(() => finish());
			});
		}
		await processes.reapAndConfirm();
	};
	return () => {
		closing ??= close();
		return closing;
	};
}
