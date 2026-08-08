# EstateOS

EstateOS is an admin-only AI marketing operating system for real-estate agencies. It detects listing changes, creates brand-safe content and video briefs, routes every campaign through approval, and records publishing performance.

## Architecture

`Property source -> Monitor -> BullMQ -> LangGraph workflow -> Approval -> Publisher -> Analytics -> Learning`

The workspace is a pnpm monorepo:

- `apps/web` — Next.js 15 administration dashboard
- `apps/api` — NestJS API, queue producers, and workflow boundary
- `packages/database` — Prisma tenant-aware data model
- `packages/workflow` — LangGraph state graph and single-purpose agent contracts

## Run locally

1. Copy `.env.example` to `.env` and provide service credentials.
2. Start dependencies with `docker compose up -d postgres redis`.
3. Run `pnpm install`, `pnpm db:generate`, `pnpm db:migrate`, then `pnpm dev`.

No publisher is enabled by default. A client must have `autoPublishEnabled` explicitly set before a publishing adapter can bypass approval.

## Security model

All records carry a `tenantId`; request-scoped repositories must require it. OAuth tokens are stored encrypted, never sent to the client, and publishing adapters use the official platform APIs only.
