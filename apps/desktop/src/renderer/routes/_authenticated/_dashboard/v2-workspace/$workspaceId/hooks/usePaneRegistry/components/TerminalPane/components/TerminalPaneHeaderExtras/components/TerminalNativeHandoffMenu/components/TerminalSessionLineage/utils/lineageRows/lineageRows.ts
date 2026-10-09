interface LineageNode {
	agent: string;
	label: string;
	sessionId: string;
}

export interface LineageEdge {
	sourceNodeId: string;
	targetNodeId: string;
	createdAt: number;
	warnings: string[];
	source: LineageNode;
	target: LineageNode;
}

export interface LineageRow extends LineageNode {
	nodeId: string;
	/** Indent level: one more for each branch above the row. */
	depth: number;
	/** When the conversation reached this session; null for where it began. */
	handedOverAt: number | null;
	warning: boolean;
	latest: boolean;
}

/**
 * Native handoffs as conversations, newest first: each one starts at a
 * session nothing was handed to and follows its handoffs in order. A chain
 * stays at one level; a session handed over more than once indents its
 * branches.
 */
export function lineageRows(edges: LineageEdge[]): LineageRow[][] {
	const nodes = new Map<string, LineageNode>();
	const incoming = new Map<string, LineageEdge>();
	const children = new Map<string, LineageEdge[]>();
	for (const edge of edges) {
		nodes.set(edge.sourceNodeId, edge.source);
		nodes.set(edge.targetNodeId, edge.target);
		incoming.set(edge.targetNodeId, edge);
		children.set(edge.sourceNodeId, [
			...(children.get(edge.sourceNodeId) ?? []),
			edge,
		]);
	}
	for (const list of children.values())
		list.sort((a, b) => a.createdAt - b.createdAt);

	const conversations: { rows: LineageRow[]; newest: number }[] = [];
	const visited = new Set<string>();
	for (const nodeId of nodes.keys()) {
		if (incoming.has(nodeId) || visited.has(nodeId)) continue;
		const rows: LineageRow[] = [];
		const walk = (id: string, depth: number) => {
			if (visited.has(id)) return;
			visited.add(id);
			const node = nodes.get(id);
			if (!node) return;
			const edge = incoming.get(id);
			rows.push({
				...node,
				nodeId: id,
				depth,
				handedOverAt: edge?.createdAt ?? null,
				warning: (edge?.warnings.length ?? 0) > 1,
				latest: false,
			});
			const next = children.get(id) ?? [];
			for (const child of next)
				walk(child.targetNodeId, next.length > 1 ? depth + 1 : depth);
		};
		walk(nodeId, 0);
		const newest = Math.max(...rows.map((row) => row.handedOverAt ?? 0));
		const latest = rows.find(
			(row) => !children.has(row.nodeId) && (row.handedOverAt ?? 0) === newest,
		);
		if (latest) latest.latest = true;
		conversations.push({ rows, newest });
	}
	return conversations
		.sort((a, b) => b.newest - a.newest)
		.map((conversation) => conversation.rows);
}
