# Agent guide

Start here, in this order:

1. `openspec/project.md` — what this service is and is not.
2. `docs/architecture/README.md` — layers, request flows, decision log.
3. `.cursor/rules/` — enforceable conventions (auto-attached by path in Cursor).
4. `openspec/AGENTS.md` — how to propose, implement and archive a change.

Commands:

```sh
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose up --build            # api + db
docker compose --profile cache up    # + redis
```

Rules that are easy to get wrong:

- No feature code without an approved OpenSpec change.
- `src/domain` stays pure; ESLint fails the build if it imports outer layers or I/O modules.
- Evaluate returns `200` + `reason: "not_found"` for missing flags.
- Admin mutation, audit insert: same transaction. Cache delete: after commit, before 2xx.
- Commits are conventional and authored by the repo owner only. No `Co-authored-by` trailers.
