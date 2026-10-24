import { expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { openPullRequestPaneInStore } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/openPullRequestPaneInStore";
import { usePullRequestPaneIntent } from "renderer/stores/pull-request-pane-intent";
import { forkPullRequestIdentity } from "./fork-pull-request-ref";
import { forkReviewCommentUrl } from "./fork-review-comment-link";
import {
	forkBranchBrowserLink,
	forkSidebarRepository,
} from "./fork-scm-browser";
import { getPullRequestTarget } from "./github/getPullRequestTarget";
import {
	isSamePullRequest,
	pullRequestRefFromBareUrl,
	pullRequestRefFromUrl,
} from "./github/pullRequestRef";

test("Bitbucket PR identity survives sidebar intent, pane creation and retargeting", () => {
	const ref = pullRequestRefFromUrl(
		"https://bitbucket.org/team/app/pull-requests/7/diff",
	);
	expect(ref).toEqual({
		repoFullName: "team/app",
		number: 7,
		forkProvider: "bitbucket",
	});
	if (!ref) throw new Error("Missing reference");
	const store = createWorkspaceStore<PaneViewerData>();
	store
		.getState()
		.addTab({ panes: [{ kind: "diff", data: {} as PaneViewerData }] });
	usePullRequestPaneIntent.getState().request({ workspaceId: "ws", ...ref });
	const intent = usePullRequestPaneIntent.getState().consume("ws");
	if (!intent) throw new Error("Missing intent");
	openPullRequestPaneInStore(store, {
		repoFullName: intent.repoFullName,
		number: intent.number,
		...forkPullRequestIdentity(intent),
	});
	const panes = () =>
		store
			.getState()
			.tabs.flatMap((tab) => Object.values(tab.panes))
			.filter((pane) => pane.kind === "pull-request");
	expect(panes()[0]?.data).toEqual(ref);
	openPullRequestPaneInStore(store, { repoFullName: "team/app", number: 7 });
	expect(panes()).toHaveLength(1);
	expect(panes()[0]?.data).toEqual({ repoFullName: "team/app", number: 7 });
	expect(isSamePullRequest(ref, { repoFullName: "team/app", number: 7 })).toBe(
		false,
	);
});

test("browser PR recognition keeps providers separate and accepts only bare PRs for checkout", () => {
	const projects = [
		{
			projectKey: "github",
			repoOwner: "team",
			repoName: "app",
			repoUrl: "https://github.com/team/app.git",
		},
		{
			projectKey: "bitbucket",
			repoOwner: null,
			repoName: null,
			repoUrl: "git@bitbucket.org:team/app.git",
		},
	];
	expect(
		getPullRequestTarget(
			"https://bitbucket.org/team/app/pull-requests/7",
			projects,
		)?.projectId,
	).toBe("bitbucket");
	expect(
		getPullRequestTarget(
			"https://bitbucket.org/other/app/pull-requests/7",
			projects,
		),
	).toBeNull();
	expect(
		pullRequestRefFromBareUrl(
			"https://bitbucket.org/team/app/pull-requests/7/?x=1",
		)?.forkProvider,
	).toBe("bitbucket");
	expect(
		pullRequestRefFromBareUrl(
			"https://bitbucket.org/team/app/pull-requests/7/diff",
		),
	).toBeNull();
	expect(
		pullRequestRefFromUrl(
			"https://bitbucket.org.attacker.example/team/app/pull-requests/7",
		),
	).toBeNull();
	expect(
		forkReviewCommentUrl("https://bitbucket.org/team/app/pull-requests/7", 12),
	).toEndWith("#comment-12");
	expect(
		forkReviewCommentUrl("https://github.com/team/app/pull/7", 12),
	).toEndWith("#discussion_r12");
});

test("external Bitbucket repository and branch links use the Bitbucket browser paths", () => {
	expect(forkSidebarRepository("git@bitbucket.org:team/app.git").repoUrl).toBe(
		"https://bitbucket.org/team/app",
	);
	expect(
		forkBranchBrowserLink("https://bitbucket.org/team/app", "feature/login")
			.href,
	).toBe("https://bitbucket.org/team/app/src/feature%2Flogin/");
	expect(forkSidebarRepository("https://github.com/team/app")).toEqual({});
});
