import "../../../scripts/test-preload.ts";

process.env.SKIP_ENV_VALIDATION = "1";
// Importing @superset/auth/stripe constructs a client, which throws without a key.
process.env.STRIPE_SECRET_KEY ??= "sk_test_placeholder";
