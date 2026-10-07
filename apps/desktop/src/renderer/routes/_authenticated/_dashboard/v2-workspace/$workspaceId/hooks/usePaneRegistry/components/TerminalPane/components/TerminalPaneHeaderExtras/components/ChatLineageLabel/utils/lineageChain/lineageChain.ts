export interface LineageEdge {
	createdAt: number;
	source: { agent: string; sessionId: string; label: string };
	target: { agent: string; sessionId: string; label: string };
}

const MAX_HOPS = 8;

/**
 * Where a chat session came from (oldest first) and, when it was later
 * continued with another agent, where it went last.
 */
export function lineageChain(
	edges: LineageEdge[],
	agent: string,
	sessionId: string,
): { from: string[]; continuedIn: string | null } {
	const same = (
		node: { agent: string; sessionId: string },
		a: string,
		s: string,
	) => node.agent === a && node.sessionId === s;
	const from: string[] = [];
	const seen = new Set<string>();
	let current = { agent, sessionId };
	while (from.length < MAX_HOPS && !seen.has(current.sessionId)) {
		seen.add(current.sessionId);
		const node = current;
		const parent = edges.find((edge) =>
			same(edge.target, node.agent, node.sessionId),
		);
		if (!parent) break;
		from.unshift(parent.source.label);
		current = parent.source;
	}
	const next = edges
		.filter((edge) => same(edge.source, agent, sessionId))
		.sort((a, b) => b.createdAt - a.createdAt)[0];
	return { from, continuedIn: next ? next.target.label : null };
}
