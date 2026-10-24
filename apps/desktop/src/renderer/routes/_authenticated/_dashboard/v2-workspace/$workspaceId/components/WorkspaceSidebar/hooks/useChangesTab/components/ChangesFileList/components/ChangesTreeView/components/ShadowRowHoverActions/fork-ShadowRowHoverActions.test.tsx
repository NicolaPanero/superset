import { expect, test } from "bun:test";
import { fireEvent, render } from "renderer/test-utils/fork-ui";
import { ShadowRowHoverActions } from "./ShadowRowHoverActions";

test("stage actions follow shadow rows without another mouseover", () => {
	const staged: string[] = [];
	const view = render(
		<ShadowRowHoverActions
			findFileRow={(event) =>
				(event.nativeEvent
					.composedPath()
					.find(
						(node) =>
							node instanceof HTMLElement &&
							node.hasAttribute("data-item-path"),
					) as HTMLElement | undefined) ?? null
			}
			renderInlineActions={(path) => (
				<button
					type="button"
					data-testid="stage"
					onClick={() => staged.push(path)}
				>
					{path}
				</button>
			)}
			renderMenuContent={() => null}
		>
			<div data-testid="tree">
				<div data-testid="first" data-item-path="first.ts" />
				<div data-testid="second" data-item-path="second.ts" />
			</div>
		</ShadowRowHoverActions>,
	);
	const first = view.getByTestId("first");
	const second = view.getByTestId("second");

	fireEvent.mouseOver(first, { composed: true });
	expect(view.getByTestId("stage").textContent).toBe("first.ts");
	fireEvent.mouseMove(second, { composed: true });
	expect(view.getByTestId("stage").textContent).toBe("second.ts");
	fireEvent.click(view.getByTestId("stage"));
	expect(staged).toEqual(["second.ts"]);

	fireEvent.scroll(view.getByTestId("tree"));
	expect(view.queryByTestId("stage")).toBeNull();
	fireEvent.mouseMove(second, { composed: true });
	expect(view.getByTestId("stage").textContent).toBe("second.ts");
});
