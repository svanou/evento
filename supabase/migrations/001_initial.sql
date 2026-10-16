-- Evento: persistent worker and user data. Run with the privileged migration role.
-- Browser clients (including authenticated Supabase users) have no direct table access.
-- Users access only their own data through scoped Next.js session endpoints.
-- Admin Supabase Auth is checked by Next.js before privileged server queries.
-- Never expose DATABASE_URL or use the service role in a browser.
BEGIN;

CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, email_hash TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, data TEXT NOT NULL, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS consents (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, kind TEXT NOT NULL, version TEXT NOT NULL, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, purpose TEXT NOT NULL, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS editions (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, weekend TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, data TEXT, error TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, UNIQUE(profile_id,weekend,revision));
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, edition_id TEXT NOT NULL UNIQUE REFERENCES editions(id) ON DELETE CASCADE, status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, run_after BIGINT NOT NULL, lease TEXT, locked_until BIGINT, error TEXT, created_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(status,run_after);
CREATE TABLE IF NOT EXISTS job_attempts (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, attempt INTEGER NOT NULL, state TEXT NOT NULL, error TEXT, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS candidates (id TEXT PRIMARY KEY, edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE, candidate_id TEXT NOT NULL, kind TEXT NOT NULL, created_at BIGINT NOT NULL, UNIQUE(profile_id,edition_id,candidate_id));
CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, weekend TEXT NOT NULL, state TEXT NOT NULL, payload TEXT, provider_id TEXT, error TEXT, updated_at BIGINT NOT NULL, UNIQUE(profile_id,weekend));
CREATE TABLE IF NOT EXISTS delivery_attempts (id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE, state TEXT NOT NULL, error TEXT, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at BIGINT NOT NULL);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles FROM anon, authenticated;
CREATE POLICY deny_client_access ON public.profiles FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consents FROM anon, authenticated;
CREATE POLICY deny_client_access ON public.consents FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tokens FROM anon, authenticated;
CREATE POLICY deny_client_access ON public.tokens FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
ALTER TABLE public.editions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.editions FROM anon, authenticated;
CREATE POLICY deny_client_access ON public.editions FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jobs FROM anon, authenticated;
CREATE POLICY deny_client_access ON public.jobs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
ALTER TABLE public.job_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_attempts FROM anon, authenticated;
CREATE POLICY deny_client_access ON public.job_attempts FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.candidates FROM anon, authenticated;
CREATE POLICY deny_client_access ON public.candidates FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback FROM anon, authenticated;
CREATE POLICY deny_client_access ON public.feedback FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deliveries FROM anon, authenticated;
CREATE POLICY deny_client_access ON public.deliveries FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
ALTER TABLE public.delivery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_attempts FROM anon, authenticated;
CREATE POLICY deny_client_access ON public.delivery_attempts FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
ALTER TABLE public.cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cache FROM anon, authenticated;
CREATE POLICY deny_client_access ON public.cache FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
CREATE POLICY deny_client_access ON public.rate_limits FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMIT;
