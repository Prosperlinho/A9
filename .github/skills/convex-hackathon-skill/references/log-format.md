# Hackathon log format

Use this reference whenever creating or updating `hackathon.md`.

## Contents

- Header format
- Field rules
- Entry format
- Convex detection guide
- Backfill and update rules

## Header format

Keep these labels and this order. Omit `Event` when it is unknown. Use `none` or `not deployed` where the field rules allow it.

```markdown
# Hackathon log

- **Project:** StandupSync
- **Event:** Convex + OpenAI Global Hackathon
- **What it does:** Realtime async standups with AI summaries of team blockers.
- **Live app:** https://standupsync.convex.site
- **Repo:** https://github.com/team/standupsync
- **Frontend:** Convex static hosting
- **Convex deployment:** https://standupsync-prod.convex.cloud
- **Components:** @convex-dev/agent, @convex-dev/rate-limiter
- **Convex features:** queries, mutations, actions, crons, full-text search
- **Auth:** Convex Auth
- **AI models:** gpt-5.6
- **Started:** 2026-08-18T14:02:11Z
- **Last updated:** 2026-08-21T09:41:55Z

## Log
```

## Field rules

- **Project:** Use the product name from a manifest, existing product copy, or the folder name.
- **Event:** Use optional free text supplied by the user or checked-in project docs. Omit when unknown.
- **What it does:** Write one factual sentence grounded in the app or docs. Use `Not documented yet` if unknown.
- **Live app:** Use one public app URL, or `not deployed` when absent.
- **Repo:** Use a normalized public remote URL, `private`, or `none`.
- **Frontend:** Use `Codex Sites`, `Convex static hosting`, `Vercel`, `Netlify`, `Other`, or `not deployed`.
- **Convex deployment:** Use a public `*.convex.cloud` URL or `not deployed`.
- **Components:** List only registered `@convex-dev/*` components, or `none`.
- **Convex features:** Use short feature names backed by code, or `none yet`.
- **Auth:** Use `Convex Auth`, `WorkOS`, `Clerk`, `Other`, or `none`.
- **AI models:** Record evidenced model identifiers, or `none`.
- **Started:** Use the first meaningful commit time, or the earliest trustworthy source-file modification time, in UTC ISO 8601.
- **Last updated:** Use the time of the latest logged evidence. Do not change it on a no-op run.

## Entry format

Append entries oldest to newest. Use a short commit SHA when Git exists; otherwise use the date alone. For uncommitted work use `working tree`. Summarize behavior first, then files and evidenced Convex features.

## Convex detection guide

Use code and configuration as proof: `defineSchema` or `defineTable` means schema/tables; `.index(` means indexes; `.searchIndex(` means full-text search; `.vectorIndex(` means vector search; `query`, `mutation`, `action`, `httpAction`, `crons`, `ctx.scheduler`, `storage.`, `useQuery`, and `usePaginatedQuery` identify their corresponding features. `app.use(` in `convex/convex.config.ts` proves a registered component. `@convex-dev/auth` plus auth files proves Convex Auth. `convexGateway(` identifies AI Gateway and its model.

Check all manifest dependency sections. A package alone does not prove active use.

## Backfill and update rules

Use chronological Git history for a start backfill. Skip generated output, lockfile-only, and formatting-only changes. Inspect committed and uncommitted work. Do not claim a deployment, integration, model, component, or feature without local evidence or an explicit user statement. Preserve user corrections unless newer evidence disproves them.
