import { useRef } from "react";

export function useForkMenuDialog() {
	const pending = useRef<(() => void) | null>(null);
	return {
		afterClose: (action: () => void) => {
			pending.current = action;
		},
		onCloseAutoFocus: (event: Event) => {
			const action = pending.current;
			pending.current = null;
			if (!action) return;
			event.preventDefault();
			action();
		},
	};
}
