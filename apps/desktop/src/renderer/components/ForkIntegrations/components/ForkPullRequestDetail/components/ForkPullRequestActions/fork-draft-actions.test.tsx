import { expect, test } from "bun:test";
import type { ForkPullRequest } from "@superset/shared/fork-integrations";
import { fireEvent, render } from "renderer/test-utils/fork-ui";
import { ForkPullRequestActions } from "./ForkPullRequestActions";

test("a Bitbucket draft can be marked ready but cannot be merged", () => {
	const actions: string[] = [];
	const pr = {
		repository: { provider: "bitbucket" },
		state: "open",
		isDraft: true,
	} as ForkPullRequest;
	const view = render(
		<ForkPullRequestActions
			pr={pr}
			busy={false}
			merging={false}
			mergeMethods={[]}
			method="merge_commit"
			onMethodChange={() => {}}
			onAction={(action) => actions.push(action)}
			onEdit={() => {}}
			canSetDraft
		/>,
	);
	expect(view.queryByRole("button", { name: "Merge" })).toBeNull();
	fireEvent.click(view.getByRole("button", { name: "Ready for review" }));
	expect(actions).toEqual(["set-draft"]);
});
