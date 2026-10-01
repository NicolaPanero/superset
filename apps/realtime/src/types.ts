import type { OrgHub } from "./org-hub";
import type { PageHub } from "./page-hub";

export interface RealtimeEnv {
	NEXT_PUBLIC_API_URL: string;
	/**
	 * Shared with the API, which presents it on every emit and on every page
	 * storage op, and which signs subscribe tickets with it.
	 */
	NUDGE_SECRET: string;
	/** Optional; Sentry capture is a no-op until the secret is set. */
	SENTRY_DSN?: string;
	OrgHub: DurableObjectNamespace<OrgHub>;
	PageHub: DurableObjectNamespace<PageHub>;
}
