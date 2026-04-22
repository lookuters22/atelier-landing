-- Invoice PDF template / setup: server-backed structured JSON (Ana-readiness; replaces browser-only for signed-in).
CREATE TABLE public.studio_invoice_setup (
  photographer_id UUID PRIMARY KEY REFERENCES public.photographers(id) ON DELETE CASCADE,
  template JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.studio_invoice_setup IS
  'Per-tenant invoice PDF template/setup (branding, terms, logo ref). Replaces local-only storage for logged-in operators.';

COMMENT ON COLUMN public.studio_invoice_setup.template IS
  'Structured InvoiceSetupState + schema_version — patchable; large logo may live in data URL until a future asset column.';

CREATE INDEX idx_studio_invoice_setup_photographer_updated
  ON public.studio_invoice_setup (photographer_id, updated_at DESC);

ALTER TABLE public.studio_invoice_setup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "studio_invoice_setup_tenant_isolation"
  ON public.studio_invoice_setup
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));
