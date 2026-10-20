import type { ReactNode } from "react";

export type ForkModelPickerProps = {
	emptyLabel?: string;
	footer?: ReactNode;
	keepOpenOnPick?: boolean;
	onOpenChange?: (open: boolean) => void;
	onCloseAutoFocus?: (event: Event) => void;
};
