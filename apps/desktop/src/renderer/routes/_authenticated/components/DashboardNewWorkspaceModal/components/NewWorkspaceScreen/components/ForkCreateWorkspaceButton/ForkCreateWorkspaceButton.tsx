import { Trans } from "@lingui/react/macro";
import { Spinner } from "@superset/ui/spinner";
import { ArrowUpIcon } from "lucide-react";
import { formatHotkeyDisplay, PLATFORM } from "renderer/hotkeys";

export function ForkCreateWorkspaceButton({
	kind,
	disabled,
	isCreating,
	onSubmit,
}: {
	kind: "workspace" | "agent" | "chat";
	disabled: boolean;
	isCreating: boolean;
	onSubmit: () => void;
}) {
	return (
		<button
			className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-foreground px-2.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
			disabled={disabled}
			onClick={(event) => {
				event.preventDefault();
				onSubmit();
			}}
			type="button"
		>
			{isCreating ? (
				<Spinner className="size-3.5" />
			) : (
				<ArrowUpIcon className="size-3.5" />
			)}
			{kind === "chat" ? (
				<Trans>Start chat</Trans>
			) : kind === "agent" ? (
				<Trans>Create & start</Trans>
			) : (
				<Trans>Create workspace</Trans>
			)}
			<kbd className="font-sans text-[11px] opacity-60">
				{formatHotkeyDisplay("meta+enter", PLATFORM).text}
			</kbd>
		</button>
	);
}
