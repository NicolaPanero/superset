import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { env } from "renderer/env.renderer";

/**
 * Whether agent terminals offer the ACP chat surface. PostHog is disabled in
 * local dev, so the flag can never come back true there and development gets
 * its own way in.
 */
export function useAcpChatEnabled(): boolean {
	const flag = useFeatureFlagEnabled(FEATURE_FLAGS.ACP_CHAT) ?? false;
	return flag || env.NODE_ENV === "development";
}
