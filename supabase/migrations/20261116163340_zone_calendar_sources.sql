BEGIN;
ALTER TABLE public.newsletter_sources ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.newsletter_sources ADD COLUMN IF NOT EXISTS visual TEXT NOT NULL DEFAULT 'village';
ALTER TABLE public.zone_newsletters ADD COLUMN IF NOT EXISTS calendar_revision INTEGER;
ALTER TABLE public.zone_newsletters ADD COLUMN IF NOT EXISTS calendar_published_at BIGINT;
CREATE TABLE IF NOT EXISTS public.sponsor_inquiries (
 id TEXT PRIMARY KEY, zone TEXT NOT NULL REFERENCES public.newsletter_zones(id),
 name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL, created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sponsor_inquiries_zone_created ON public.sponsor_inquiries(zone,created_at);
CREATE INDEX IF NOT EXISTS newsletter_sources_zone_enabled ON public.newsletter_sources(zone,enabled);
ALTER TABLE public.sponsor_inquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sponsor_inquiries FROM anon, authenticated;
DROP POLICY IF EXISTS deny_client_access ON public.sponsor_inquiries;
CREATE POLICY deny_client_access ON public.sponsor_inquiries FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
COMMIT;
