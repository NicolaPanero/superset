import { FORK_DISPLAY_NAME, FORK_PRODUCT_NAME } from "./fork-display-name";

/**
 * The fork's release identity. Built with SUPERSET_WORKSPACE_NAME=fork, the
 * app installs beside the official one as "Paradev++.app": its own bundle id,
 * deep-link scheme (`superset-fork`, accepted by Superset's sign-in) and, via
 * the same variable at runtime, its own ~/.superset-fork data folder.
 * `runtimeName` stays "Superset++": it names the keychain entry and the logs.
 */
export function forkIdentity(productName: string) {
	if (process.env.SUPERSET_WORKSPACE_NAME !== "fork")
		return {
			productName,
			runtimeName: productName,
			appId: "com.superset.desktop",
			scheme: "superset",
		};
	return {
		productName: FORK_DISPLAY_NAME,
		runtimeName: FORK_PRODUCT_NAME,
		appId: "com.superset.desktop.fork",
		scheme: "superset-fork",
	};
}
