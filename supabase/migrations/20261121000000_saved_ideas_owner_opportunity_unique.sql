-- PostgREST upserts saved ideas on this pair. Existing duplicates must be
-- reviewed before migration so an upgrade never discards a saved idea.
CREATE UNIQUE INDEX IF NOT EXISTS saved_ideas_user_id_opportunity_id_uidx
  ON public.saved_ideas (user_id, opportunity_id);
