import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";

export function ForkPullRequestsBoundary({
	children,
}: {
	children: ReactNode;
}) {
	const search = useSearch({ strict: false }) as {
		forkProvider?: "bitbucket";
		forkProject?: string;
		forkNumber?: number;
	};
	const navigate = useNavigate();
	useEffect(() => {
		if (
			search.forkProvider === "bitbucket" &&
			search.forkNumber &&
			search.forkProject
		) {
			void navigate({
				to: "/pull-requests/$prNumber",
				params: { prNumber: String(search.forkNumber) },
				search: { forkProvider: "bitbucket", project: search.forkProject },
				replace: true,
			});
		}
	}, [navigate, search.forkProvider, search.forkNumber, search.forkProject]);
	return children;
}
