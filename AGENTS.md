# Agent guide

Start here, in this order:

1. `openspec/config.yaml` — project context and OpenSpec artifact rules (Fission-AI OpenSpec).
2. `openspec/project.md` — same context in prose (legacy link target).
3. `docs/architecture/README.md` — layers, request flows, decision log.
4. `.cursor/rules/` — enforceable conventions (auto-attached by path in Cursor).
5. `openspec/README.md` — CLI install, `/opsx-*` Cursor commands, validate/archive loop.

Commands:

```sh
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose up --build            # api + db
docker compose --profile cache up    # + redis
```

OpenSpec (feature work):

```sh
npm install -g @fission-ai/openspec@latest
openspec validate --all
```

In Cursor: `/opsx-propose` → `/opsx-apply` → `openspec validate <change-id> --strict` → `/opsx-archive`.

Rules that are easy to get wrong:

- No feature code without an approved OpenSpec change.
- `src/domain` stays pure; ESLint fails the build if it imports outer layers or I/O modules.
- Evaluate returns `200` + `reason: "not_found"` for missing flags.
- Admin mutation, audit insert: same transaction. Cache delete: after commit, before 2xx.
- Commits are conventional and authored by the repo owner only. No `Co-authored-by` trailers.
