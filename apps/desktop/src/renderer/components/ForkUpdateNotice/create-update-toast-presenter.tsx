import { toast } from "@superset/ui/sonner";
import { ForkUpdateToast } from "./components/ForkUpdateToast";
import { createForkUpdatePresenter } from "./fork-update-presenter";

export function createUpdateToastPresenter({
	install,
	later,
	focused = () => document.visibilityState === "visible" && document.hasFocus(),
}: {
	install: (tag: string) => Promise<boolean>;
	later: (tag: string) => void;
	focused?: () => boolean;
}) {
	let toastId: string | number | undefined;
	const hide = () => {
		if (toastId !== undefined) toast.dismiss(toastId);
		toastId = undefined;
	};
	return createForkUpdatePresenter({
		focused,
		hide,
		show(notice) {
			hide();
			toastId = toast.custom(
				() => (
					<ForkUpdateToast
						tag={notice.tag}
						onInstall={() => install(notice.tag)}
						onLater={() => later(notice.tag)}
					/>
				),
				{
					duration: Infinity,
					position: "bottom-right",
					dismissible: false,
					closeButton: false,
				},
			);
		},
	});
}
