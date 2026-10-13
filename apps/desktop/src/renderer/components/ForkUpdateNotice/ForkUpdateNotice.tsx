import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { createUpdateToastPresenter } from "./create-update-toast-presenter";

export function ForkUpdateNotice() {
	const install = electronTrpc.autoUpdate.forkInstall.useMutation();
	const dismiss = electronTrpc.autoUpdate.forkDismiss.useMutation();
	const actions = useRef({ install, dismiss });
	actions.current = { install, dismiss };
	const presenter = useRef<ReturnType<
		typeof createUpdateToastPresenter
	> | null>(null);
	presenter.current ??= createUpdateToastPresenter({
		install: (tag) => actions.current.install.mutateAsync({ tag }),
		later: (tag) => {
			actions.current.dismiss.mutate(
				{ tag },
				{ onError: (error) => toast.error(errorMessage(error)) },
			);
		},
	});
	electronTrpc.autoUpdate.forkSubscribe.useSubscription(undefined, {
		onData: (notice) => presenter.current?.update(notice),
	});
	useEffect(() => {
		const current = presenter.current;
		const foreground = () => current?.foreground();
		window.addEventListener("focus", foreground);
		document.addEventListener("visibilitychange", foreground);
		return () => {
			window.removeEventListener("focus", foreground);
			document.removeEventListener("visibilitychange", foreground);
			current?.dispose();
		};
	}, []);
	return null;
}
