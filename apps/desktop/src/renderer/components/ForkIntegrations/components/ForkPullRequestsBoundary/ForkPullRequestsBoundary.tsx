import { Button } from "@superset/ui/button";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useForkConnections } from "../../hooks/useForkConnections";
import { ForkPullRequests } from "../ForkPullRequests/ForkPullRequests";
export function ForkPullRequestsBoundary({
	children,
}: {
	children: ReactNode;
}) {
	const { connections } = useForkConnections(),
		navigate = useNavigate();
	const search = useSearch({ strict: false }) as { forkProvider?: string };
	const available = connections.some(
		(c) => c.provider === "bitbucket" && c.enabled,
	);
	const selected = available && search.forkProvider === "bitbucket";
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			{available && (
				<div className="flex gap-2 border-b px-4 py-2">
					<Button
						size="sm"
						variant={!selected ? "secondary" : "ghost"}
						onClick={() => void navigate({ to: "/pull-requests", search: {} })}
					>
						GitHub
					</Button>
					<Button
						size="sm"
						variant={selected ? "secondary" : "ghost"}
						onClick={() =>
							void navigate({
								to: "/pull-requests",
								search: { forkProvider: "bitbucket" },
							})
						}
					>
						Bitbucket
					</Button>
				</div>
			)}
			{selected ? <ForkPullRequests /> : children}
		</div>
	);
}
