# EstateOS foundation build

The working source is in the parent workspace:

- `apps/web` — Next.js administration dashboard
- `apps/api` — NestJS ingestion and approval endpoints with BullMQ queues
- `packages/database/prisma/schema.prisma` — PostgreSQL tenant-aware data model
- `packages/workflow/src/marketing-graph.ts` — approval-first LangGraph topology

## Start

Copy `.env.example` to `.env`, launch PostgreSQL and Redis with `docker compose up -d`, then run `pnpm install`, `pnpm db:generate`, `pnpm db:migrate`, and `pnpm dev`.

Publishing remains approval-gated. Connect OAuth credentials and implement each official social-network adapter before enabling a tenant's `autoPublishEnabled` flag.
