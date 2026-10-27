import { useLingui } from "@lingui/react/macro";
import { Bot } from "lucide-react";
import { useMemo } from "react";
import type { IconType } from "react-icons";
import { BsTerminalPlus } from "react-icons/bs";
import { LuGitCompareArrows, LuMessageSquare, LuSearch } from "react-icons/lu";
import { TbWorld } from "react-icons/tb";
import {
	ForkHomeBackground,
	ForkHomeBrand,
} from "renderer/components/ForkHomeBackground";
import { ForkProductMark } from "renderer/components/ForkProductMark";
import { GitHubStarPill } from "renderer/components/GitHubStarPill";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { EmptyTabActionButton } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/components/EmptyTabActionButton";

interface WorkspaceEmptyStateProps {
	onOpenAgent: () => void;
	onOpenBrowser: () => void;
	onOpenChanges: () => void;
	onOpenChat?: (() => void) | undefined;
	onOpenQuickOpen: () => void;
	onOpenTerminal: () => void;
}

interface WorkspaceEmptyStateAction {
	display: string[];
	icon: IconType;
	id: string;
	label: string;
	onClick: () => void;
}

export function WorkspaceEmptyState({
	onOpenAgent,
	onOpenBrowser,
	onOpenChanges,
	onOpenChat,
	onOpenQuickOpen,
	onOpenTerminal,
}: WorkspaceEmptyStateProps) {
	const { t } = useLingui();
	const { keys: newAgentDisplay } = useHotkeyDisplay("NEW_AGENT");
	const { keys: newGroupDisplay } = useHotkeyDisplay("NEW_GROUP");
	const { keys: newChatDisplay } = useHotkeyDisplay("NEW_CHAT");
	const { keys: newBrowserDisplay } = useHotkeyDisplay("NEW_BROWSER");
	const { keys: quickOpenDisplay } = useHotkeyDisplay("QUICK_OPEN");
	const { keys: openChangesDisplay } = useHotkeyDisplay("OPEN_DIFF_VIEWER");

	const actions = useMemo<Array<WorkspaceEmptyStateAction>>(
		() => [
			{
				id: "agent",
				label: t({
					message: "New Chat",
				}),
				display: newAgentDisplay,
				icon: Bot,
				onClick: onOpenAgent,
			},
			{
				id: "terminal",
				label: t({
					message: "Open Terminal",
				}),
				display: newGroupDisplay,
				icon: BsTerminalPlus,
				onClick: onOpenTerminal,
			},
			...(onOpenChat
				? [
						{
							id: "chat",
							label: t({ message: "Open Chat" }),
							display: newChatDisplay,
							icon: LuMessageSquare,
							onClick: onOpenChat,
						},
					]
				: []),
			{
				id: "browser",
				label: t({
					message: "Open Browser",
				}),
				display: newBrowserDisplay,
				icon: TbWorld,
				onClick: onOpenBrowser,
			},
			{
				id: "changes",
				label: t({
					message: "Open Changes",
				}),
				display: openChangesDisplay,
				icon: LuGitCompareArrows,
				onClick: onOpenChanges,
			},
			{
				id: "search-files",
				label: t({
					message: "Search Files",
				}),
				display: quickOpenDisplay,
				icon: LuSearch,
				onClick: onOpenQuickOpen,
			},
		],
		[
			newAgentDisplay,
			newBrowserDisplay,
			newChatDisplay,
			newGroupDisplay,
			onOpenBrowser,
			onOpenAgent,
			onOpenChanges,
			onOpenChat,
			onOpenQuickOpen,
			onOpenTerminal,
			openChangesDisplay,
			quickOpenDisplay,
			t,
		],
	);

	return (
		<div className="relative isolate flex h-full flex-1 items-center justify-center px-6 py-10">
			<ForkHomeBackground active />
			<div className="w-full max-w-xl">
				<div className="mb-7 flex items-center justify-center py-3">
					<ForkHomeBrand compact>
						<ForkProductMark className="h-8 w-auto select-none text-foreground/80" />
					</ForkHomeBrand>
				</div>
				<div className="mx-auto grid w-full max-w-md gap-0.5">
					{actions.map((action) => (
						<EmptyTabActionButton
							key={action.id}
							display={action.display}
							icon={action.icon}
							label={action.label}
							onClick={action.onClick}
						/>
					))}
				</div>
				<GitHubStarPill className="mt-6" />
			</div>
		</div>
	);
}
