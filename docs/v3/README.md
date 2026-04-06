# Atelier OS V3.1 — Canonical documentation (`docs/v3/`)

**Active source of truth** for the current build (`execute_v3.md` Phase 0, Step 0A).

Material under `docs/updated dcs/` and other legacy paths is **not** the primary contract for new work unless a task explicitly says to compare or migrate from it.

## Where to start

| Need | File |
|------|------|
| One phase, one slice | `V3_QUICKSTART.md` |
| Phase map and reading list | `V3_BUILD_INDEX.md` |
| Roadmap and steps | `execute_v3.md` |
| Runtime architecture | `ARCHITECTURE.md` |
| Schema contract | `DATABASE_SCHEMA.md` (verify against `supabase/migrations/` first) |
| Prompting | `V3_PROMPTING_GUIDE.md`, `prompts/README.md`, `step-prompts/README.md` |

## Truth order for schema

1. `supabase/migrations/*`
2. `docs/v3/DATABASE_SCHEMA.md`
3. `src/types/database.types.ts` (regenerated after migrations)

Repo root `.cursorrules` is aligned with this tree.
