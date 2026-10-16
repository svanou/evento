BEGIN;
ALTER TABLE public.zone_newsletters ADD COLUMN IF NOT EXISTS dispatch_started_at BIGINT;
CREATE TABLE IF NOT EXISTS public.automation_state (
  id TEXT PRIMARY KEY, lease TEXT, locked_until BIGINT,
  last_started_at BIGINT, last_finished_at BIGINT, last_source TEXT,
  last_error TEXT, prepared INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0
);
INSERT INTO public.automation_state(id) VALUES('runner') ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.automation_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_state FROM anon, authenticated;
DROP POLICY IF EXISTS deny_client_access ON public.automation_state;
CREATE POLICY deny_client_access ON public.automation_state FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
COMMIT;
