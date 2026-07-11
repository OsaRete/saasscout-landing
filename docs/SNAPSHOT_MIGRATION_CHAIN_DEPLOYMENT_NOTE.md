# Snapshot Migration Chain Deployment Note

Status: deployment guard  
Owner: SaaSScout Architecture / Data Integrity

## Why this note exists

The active migration chain still contains `supabase/migrations/20260629000000_create_knowledge_evolution_schema.sql`, and it sorts before `supabase/migrations/20260710000000_create_snapshot_persistence_schema.sql`.

That means a fresh environment will apply the old Knowledge Evolution migration before Snapshot persistence. This PR does not modify, delete, rename, repair, or remotely apply that old migration.

## Deployment guardrails

Before any deployment involving Snapshot persistence:

1. Inspect the live Supabase migration history.
2. Confirm whether the old Knowledge Evolution migration has already been applied remotely.
3. Do not run `supabase db push` blindly from a local checkout.
4. Do not repair migration history, rename migrations, delete migrations, or run remote schema actions until the live migration state is known.
5. Validate the Snapshot persistence migration in an isolated local PostgreSQL/Supabase environment before any remote action.

## Risk status

This operational risk is documented and guarded, not automatically solved. The safe deployment path depends on the actual remote migration history.
