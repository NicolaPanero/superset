/**
 * The fork's release identity. Built with SUPERSET_WORKSPACE_NAME=fork, the
 * app installs beside the official one as "Superset++": its own bundle id,
 * deep-link scheme (`superset-fork`, accepted by Superset's sign-in) and, via
 * the same variable at runtime, its own ~/.superset-fork data folder.
 */
export function forkIdentity(productName: string) {
	if (process.env.SUPERSET_WORKSPACE_NAME !== "fork")
		return { productName, appId: "com.superset.desktop", scheme: "superset" };
	return {
		productName: `${productName}++`,
		appId: "com.superset.desktop.fork",
		scheme: "superset-fork",
	};
}
