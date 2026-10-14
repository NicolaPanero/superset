import { useEffect, useRef, useState } from "react";

const pending = new Map<string, Promise<boolean>>();

export function useForcedAgentChat(
	key: string | null,
	waiting: boolean,
	convert: () => Promise<boolean>,
) {
	const [state, setState] = useState<"idle" | "opening" | "failed">("idle");
	const [retryCount, setRetryCount] = useState(0);
	const convertRef = useRef(convert);
	convertRef.current = convert;
	const attempted = useRef<string | null>(null);
	const inflight = useRef(false);
	const mounted = useRef(false);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	useEffect(() => {
		if (!key) {
			attempted.current = null;
			setState("idle");
			return;
		}
		const attempt = `${key}:${retryCount}`;
		if (waiting || inflight.current || attempted.current === attempt) return;
		attempted.current = attempt;
		inflight.current = true;
		setState("opening");
		let operation = pending.get(key);
		if (!operation) {
			operation = Promise.resolve()
				.then(() => convertRef.current())
				.finally(() => pending.delete(key));
			pending.set(key, operation);
		}
		void operation
			.then(
				(success) => {
					if (mounted.current && !success) setState("failed");
				},
				() => {
					if (mounted.current) setState("failed");
				},
			)
			.finally(() => {
				inflight.current = false;
			});
	}, [key, waiting, retryCount]);
	return { state, retry: () => setRetryCount((count) => count + 1) };
}
