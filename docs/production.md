# Production configuration

Set every environment variable from `.env.example` in the deployment platform's secret manager. Never commit `.env` files, OAuth tokens, Cloudinary secrets, or signing keys.

Generate `CREDENTIAL_ENCRYPTION_KEY`, `SOCIAL_OAUTH_STATE_SECRET`, and `PROPERTY_WEBHOOK_SECRET` with a cryptographically secure secret generator. Rotate them on exposure or privileged-staff departure.

Protect `/metrics` with private-network access. Set `SENTRY_DSN` for error reporting, `NOTIFICATION_WEBHOOK_URL` for operational alerts, and `PUBLIC_API_URL` to the public HTTPS API URL before registering provider OAuth callbacks.

Keep automatic publishing disabled until a tenant's approval and audit policy has been validated in staging.
