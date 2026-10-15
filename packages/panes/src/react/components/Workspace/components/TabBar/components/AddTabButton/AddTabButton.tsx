import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { PlusIcon } from "lucide-react";
import { useRef } from "react";
import type { WorkspaceProps } from "../../../../../../types";

export function AddTabButton({
	renderAddTabMenu,
}: {
	renderAddTabMenu?: WorkspaceProps<unknown>["renderAddTabMenu"];
}) {
	const pendingAction = useRef<(() => void) | null>(null);
	const button = (
		<Button
			className="no-drag ml-1.5 size-7 rounded-md border border-border/60 bg-muted/30 px-1 text-muted-foreground shadow-none hover:bg-accent/60 hover:text-foreground"
			size="icon"
			type="button"
			variant="ghost"
		>
			<PlusIcon className="size-3.5" />
		</Button>
	);

	if (!renderAddTabMenu) return button;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-56"
				onCloseAutoFocus={(event) => {
					const action = pendingAction.current;
					if (!action) return;
					pendingAction.current = null;
					// Returning focus to the menu trigger would dismiss the new dialog.
					event.preventDefault();
					action();
				}}
			>
				{renderAddTabMenu({
					afterClose: (action) => {
						pendingAction.current = action;
					},
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
