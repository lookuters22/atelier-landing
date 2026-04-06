import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Check, FlaskConical, MessageCircle, Phone, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  readPhotographerSettings,
  writePhotographerSettingsMerged,
} from "@/lib/photographerSettings";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";

export type SettingsHubPageProps = {
  /** When false, hides the cross-link to the manager shell (used from `/manager/settings`). */
  showManagerPreviewLink?: boolean;
};

const COUNTRY_CODES = [
  { code: "+355", flag: "\u{1F1E6}\u{1F1F1}", label: "Albania" },
  { code: "+376", flag: "\u{1F1E6}\u{1F1E9}", label: "Andorra" },
  { code: "+54", flag: "\u{1F1E6}\u{1F1F7}", label: "Argentina" },
  { code: "+43", flag: "\u{1F1E6}\u{1F1F9}", label: "Austria" },
  { code: "+61", flag: "\u{1F1E6}\u{1F1FA}", label: "Australia" },
  { code: "+32", flag: "\u{1F1E7}\u{1F1EA}", label: "Belgium" },
  { code: "+387", flag: "\u{1F1E7}\u{1F1E6}", label: "Bosnia" },
  { code: "+55", flag: "\u{1F1E7}\u{1F1F7}", label: "Brazil" },
  { code: "+359", flag: "\u{1F1E7}\u{1F1EC}", label: "Bulgaria" },
  { code: "+1", flag: "\u{1F1E8}\u{1F1E6}", label: "Canada" },
  { code: "+56", flag: "\u{1F1E8}\u{1F1F1}", label: "Chile" },
  { code: "+86", flag: "\u{1F1E8}\u{1F1F3}", label: "China" },
  { code: "+57", flag: "\u{1F1E8}\u{1F1F4}", label: "Colombia" },
  { code: "+385", flag: "\u{1F1ED}\u{1F1F7}", label: "Croatia" },
  { code: "+357", flag: "\u{1F1E8}\u{1F1FE}", label: "Cyprus" },
  { code: "+420", flag: "\u{1F1E8}\u{1F1FF}", label: "Czechia" },
  { code: "+45", flag: "\u{1F1E9}\u{1F1F0}", label: "Denmark" },
  { code: "+20", flag: "\u{1F1EA}\u{1F1EC}", label: "Egypt" },
  { code: "+372", flag: "\u{1F1EA}\u{1F1EA}", label: "Estonia" },
  { code: "+358", flag: "\u{1F1EB}\u{1F1EE}", label: "Finland" },
  { code: "+33", flag: "\u{1F1EB}\u{1F1F7}", label: "France" },
  { code: "+49", flag: "\u{1F1E9}\u{1F1EA}", label: "Germany" },
  { code: "+30", flag: "\u{1F1EC}\u{1F1F7}", label: "Greece" },
  { code: "+852", flag: "\u{1F1ED}\u{1F1F0}", label: "Hong Kong" },
  { code: "+36", flag: "\u{1F1ED}\u{1F1FA}", label: "Hungary" },
  { code: "+354", flag: "\u{1F1EE}\u{1F1F8}", label: "Iceland" },
  { code: "+91", flag: "\u{1F1EE}\u{1F1F3}", label: "India" },
  { code: "+62", flag: "\u{1F1EE}\u{1F1E9}", label: "Indonesia" },
  { code: "+353", flag: "\u{1F1EE}\u{1F1EA}", label: "Ireland" },
  { code: "+972", flag: "\u{1F1EE}\u{1F1F1}", label: "Israel" },
  { code: "+39", flag: "\u{1F1EE}\u{1F1F9}", label: "Italy" },
  { code: "+81", flag: "\u{1F1EF}\u{1F1F5}", label: "Japan" },
  { code: "+82", flag: "\u{1F1F0}\u{1F1F7}", label: "South Korea" },
  { code: "+383", flag: "\u{1F1FD}\u{1F1F0}", label: "Kosovo" },
  { code: "+371", flag: "\u{1F1F1}\u{1F1FB}", label: "Latvia" },
  { code: "+370", flag: "\u{1F1F1}\u{1F1F9}", label: "Lithuania" },
  { code: "+352", flag: "\u{1F1F1}\u{1F1FA}", label: "Luxembourg" },
  { code: "+60", flag: "\u{1F1F2}\u{1F1FE}", label: "Malaysia" },
  { code: "+356", flag: "\u{1F1F2}\u{1F1F9}", label: "Malta" },
  { code: "+52", flag: "\u{1F1F2}\u{1F1FD}", label: "Mexico" },
  { code: "+377", flag: "\u{1F1F2}\u{1F1E8}", label: "Monaco" },
  { code: "+382", flag: "\u{1F1F2}\u{1F1EA}", label: "Montenegro" },
  { code: "+212", flag: "\u{1F1F2}\u{1F1E6}", label: "Morocco" },
  { code: "+31", flag: "\u{1F1F3}\u{1F1F1}", label: "Netherlands" },
  { code: "+64", flag: "\u{1F1F3}\u{1F1FF}", label: "New Zealand" },
  { code: "+234", flag: "\u{1F1F3}\u{1F1EC}", label: "Nigeria" },
  { code: "+389", flag: "\u{1F1F2}\u{1F1F0}", label: "N. Macedonia" },
  { code: "+47", flag: "\u{1F1F3}\u{1F1F4}", label: "Norway" },
  { code: "+63", flag: "\u{1F1F5}\u{1F1ED}", label: "Philippines" },
  { code: "+48", flag: "\u{1F1F5}\u{1F1F1}", label: "Poland" },
  { code: "+351", flag: "\u{1F1F5}\u{1F1F9}", label: "Portugal" },
  { code: "+40", flag: "\u{1F1F7}\u{1F1F4}", label: "Romania" },
  { code: "+966", flag: "\u{1F1F8}\u{1F1E6}", label: "Saudi Arabia" },
  { code: "+381", flag: "\u{1F1F7}\u{1F1F8}", label: "Serbia" },
  { code: "+65", flag: "\u{1F1F8}\u{1F1EC}", label: "Singapore" },
  { code: "+421", flag: "\u{1F1F8}\u{1F1F0}", label: "Slovakia" },
  { code: "+386", flag: "\u{1F1F8}\u{1F1EE}", label: "Slovenia" },
  { code: "+27", flag: "\u{1F1FF}\u{1F1E6}", label: "South Africa" },
  { code: "+34", flag: "\u{1F1EA}\u{1F1F8}", label: "Spain" },
  { code: "+46", flag: "\u{1F1F8}\u{1F1EA}", label: "Sweden" },
  { code: "+41", flag: "\u{1F1E8}\u{1F1ED}", label: "Switzerland" },
  { code: "+66", flag: "\u{1F1F9}\u{1F1ED}", label: "Thailand" },
  { code: "+90", flag: "\u{1F1F9}\u{1F1F7}", label: "Turkey" },
  { code: "+380", flag: "\u{1F1FA}\u{1F1E6}", label: "Ukraine" },
  { code: "+971", flag: "\u{1F1E6}\u{1F1EA}", label: "UAE" },
  { code: "+44", flag: "\u{1F1EC}\u{1F1E7}", label: "United Kingdom" },
  { code: "+1", flag: "\u{1F1FA}\u{1F1F8}", label: "United States" },
  { code: "+598", flag: "\u{1F1FA}\u{1F1FE}", label: "Uruguay" },
  { code: "+84", flag: "\u{1F1FB}\u{1F1F3}", label: "Vietnam" },
];

export function SettingsHubPage({ showManagerPreviewLink = true }: SettingsHubPageProps) {
  const { photographerId } = useAuth();
  const [countryCode, setCountryCode] = useState("+381");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [waSaving, setWaSaving] = useState(false);
  const [waSaved, setWaSaved] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [studioName, setStudioName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [photographerNames, setPhotographerNames] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");
  const [adminMobileNumber, setAdminMobileNumber] = useState("");
  const [playbookVersion, setPlaybookVersion] = useState("");
  const [onboardingCompletedAt, setOnboardingCompletedAt] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [opSaving, setOpSaving] = useState(false);
  const [opSaved, setOpSaved] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  /** Phase 11.5 Step 11.5C — one dashboard readout (open escalations; not the full observability surface). */
  const [openEscalationsCount, setOpenEscalationsCount] = useState<number | null>(null);
  const [observabilityLoading, setObservabilityLoading] = useState(false);
  const [observabilityError, setObservabilityError] = useState<string | null>(null);

  useEffect(() => {
    if (!photographerId) return;
    void (async () => {
      const loaded = await readPhotographerSettings(supabase, photographerId);
      if (!loaded) return;
      const { contract, raw } = loaded;
      setStudioName(contract.studio_name ?? "");
      setManagerName(contract.manager_name ?? "");
      setPhotographerNames(contract.photographer_names ?? "");
      setTimezone(contract.timezone ?? "");
      setCurrency(contract.currency ?? "");
      setAdminMobileNumber(contract.admin_mobile_number ?? "");
      setPlaybookVersion(
        contract.playbook_version !== undefined ? String(contract.playbook_version) : "",
      );
      setOnboardingCompletedAt(contract.onboarding_completed_at ?? null);

      const saved = (raw.whatsapp_number as string) ?? "";
      if (saved) {
        const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
        const match = sorted.find((c) => saved.startsWith(c.code));
        if (match) {
          setCountryCode(match.code);
          setPhoneNumber(saved.slice(match.code.length));
        } else {
          setPhoneNumber(saved);
        }
      }
    })();
  }, [photographerId]);

  useEffect(() => {
    if (!photographerId) return;
    let cancelled = false;
    void (async () => {
      setObservabilityLoading(true);
      setObservabilityError(null);
      const { count, error } = await supabase
        .from("escalation_requests")
        .select("*", { count: "exact", head: true })
        .eq("photographer_id", photographerId)
        .eq("status", "open");
      if (cancelled) return;
      if (error) {
        setObservabilityError(error.message);
        setOpenEscalationsCount(null);
      } else {
        setOpenEscalationsCount(count ?? 0);
      }
      setObservabilityLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [photographerId]);

  async function saveProfileContract() {
    if (!photographerId) return;
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      let playbookVersionParsed: string | number | undefined;
      const pb = playbookVersion.trim();
      if (pb === "") {
        playbookVersionParsed = undefined;
      } else if (/^\d+$/.test(pb)) {
        playbookVersionParsed = Number(pb);
      } else {
        playbookVersionParsed = pb;
      }

      await writePhotographerSettingsMerged(supabase, photographerId, {
        studio_name: studioName.trim() || undefined,
        manager_name: managerName.trim() || undefined,
        photographer_names: photographerNames.trim() || undefined,
        timezone: timezone.trim() || undefined,
        currency: currency.trim() || undefined,
        playbook_version: playbookVersionParsed,
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveOperatorNumber() {
    if (!photographerId) return;
    setOpSaving(true);
    setOpError(null);
    setOpSaved(false);
    try {
      await writePhotographerSettingsMerged(supabase, photographerId, {
        admin_mobile_number: adminMobileNumber.trim() || undefined,
      });
      setOpSaved(true);
      setTimeout(() => setOpSaved(false), 3000);
    } catch (err: unknown) {
      setOpError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setOpSaving(false);
    }
  }

  async function saveWhatsAppNumber() {
    if (!photographerId) return;
    setWaSaving(true);
    setWaError(null);
    setWaSaved(false);

    const fullNumber = phoneNumber.trim() ? `${countryCode}${phoneNumber.trim().replace(/^0+/, "")}` : "";

    try {
      await writePhotographerSettingsMerged(supabase, photographerId, {
        whatsapp_number: fullNumber || undefined,
      });
      setWaSaved(true);
      setTimeout(() => setWaSaved(false), 3000);
    } catch (err: unknown) {
      setWaError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setWaSaving(false);
    }
  }

  async function fireTestLead() {
    try {
      setIsSimulating(true);
      setSimResult(null);
      /** Tenant for webhook-web comes from the Supabase session JWT on this invoke — not from body fields. */
      const { error } = await supabase.functions.invoke("webhook-web", {
        body: {
          source: "test_button",
          lead: {
            name: "Sarah & James",
            email: "sarah.test@example.com",
            event_date: "2026-09-15",
            message:
              "Hi! We are getting married in Lake Como and absolutely love your editorial style. Are you available for our dates?",
          },
        },
      });
      if (error) throw error;
      setSimResult({ ok: true, message: "Lead sent — check Inbox for the AI pipeline result." });
    } catch (err: unknown) {
      setSimResult({ ok: false, message: err instanceof Error ? err.message : "Failed to send test lead." });
    } finally {
      setIsSimulating(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="w-full">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="mt-1 max-w-lg text-[13px] text-muted-foreground">
          Studio profile, integrations, notifications, and tools.
        </p>
        {showManagerPreviewLink ? (
          <p className="mt-2 text-[13px] text-muted-foreground">
            <Link to="/manager/today" className="font-semibold text-foreground hover:underline">
              Studio manager preview
            </Link>
            {" — "}multi-photographer overview and team filtering (demo).
          </p>
        ) : null}
      </div>

      {/* ── General ── */}
      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">General</h3>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Studio identity and connectivity. Saved to <span className="font-mono text-[11px]">photographers.settings</span>{" "}
          (contract keys from Step 1A).
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Studio name</span>
            <input
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
              placeholder="Atelier · Elena Duarte"
              className={inputCls}
            />
            <span className="text-[11px] text-muted-foreground">settings.studio_name</span>
          </label>
          <label className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Default currency</span>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="EUR"
              className={inputCls}
            />
            <span className="text-[11px] text-muted-foreground">settings.currency</span>
          </label>
          <label className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Timezone</span>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/Belgrade"
              className={inputCls}
            />
            <span className="text-[11px] text-muted-foreground">settings.timezone</span>
          </label>
          <label className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Manager name</span>
            <input
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              className={inputCls}
            />
            <span className="text-[11px] text-muted-foreground">settings.manager_name</span>
          </label>
          <label className="md:col-span-2 space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Photographer names</span>
            <input
              value={photographerNames}
              onChange={(e) => setPhotographerNames(e.target.value)}
              placeholder="Elena & Marco"
              className={inputCls}
            />
            <span className="text-[11px] text-muted-foreground">settings.photographer_names</span>
          </label>
          <label className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Playbook version</span>
            <input
              value={playbookVersion}
              onChange={(e) => setPlaybookVersion(e.target.value)}
              placeholder="1 or 1.0.0"
              className={inputCls}
            />
            <span className="text-[11px] text-muted-foreground">settings.playbook_version</span>
          </label>
          <div className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Onboarding completed</span>
            <div className={inputCls + " text-muted-foreground"}>
              {onboardingCompletedAt ? onboardingCompletedAt : "—"}
            </div>
            <span className="text-[11px] text-muted-foreground">settings.onboarding_completed_at (read-only here)</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={profileSaving}
            onClick={saveProfileContract}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {profileSaved ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : null}
            {profileSaving ? "Saving…" : profileSaved ? "Profile saved" : "Save profile"}
          </button>
          {profileError ? <p className="text-[13px] text-red-500">{profileError}</p> : null}
        </div>
      </section>

      {/* ── Observability: one stat (execute_v3 §11.5C) ── */}
      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Observability snapshot</h3>
        <p className="mt-3 max-w-2xl text-[13px] text-muted-foreground">
          Phase 11.5 — single live readout only. Use it alongside rollout questions in{" "}
          <span className="font-mono text-[11px]">execute_v3.md</span> §11.5C (e.g. pressure from unresolved escalations).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-background px-4 py-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            <span className="text-[13px] font-medium text-foreground">Open escalation requests</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {observabilityLoading ? "—" : openEscalationsCount ?? "—"}
            </span>
            <Link
              to="/escalations"
              className="text-[13px] font-medium text-foreground underline-offset-2 hover:underline"
            >
              Open queue
            </Link>
          </div>
        </div>
        {observabilityError ? (
          <p className="mt-2 text-[13px] text-red-500">{observabilityError}</p>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Verifier block telemetry (<span className="font-mono">blocks_by_verifier</span>) is structured JSON in Edge
            logs — filter <span className="font-mono">v315_telemetry</span>.
          </p>
        )}
      </section>

      {/* ── Operator number (Phase 11 Step 11A) ── */}
      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Operator number</h3>
        <p className="mt-3 max-w-2xl text-[13px] text-muted-foreground">
          The number where Ana reaches you on the operator lane (blocked actions, escalations, slash commands). This is
          separate from the client-facing WhatsApp line under Integrations. Stored as{" "}
          <span className="font-mono text-[11px]">settings.admin_mobile_number</span> (E.164).
        </p>

        <div className="mt-5 rounded-lg border border-border bg-background px-4 py-4">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            <p className="text-[13px] font-semibold text-foreground">Operator WhatsApp (E.164)</p>
          </div>
          <label className="mt-3 block space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Mobile number</span>
            <input
              value={adminMobileNumber}
              onChange={(e) => {
                setAdminMobileNumber(e.target.value);
                setOpSaved(false);
              }}
              placeholder="+381601234567"
              className={inputCls}
              autoComplete="tel"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={opSaving}
              onClick={saveOperatorNumber}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {opSaved ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : null}
              {opSaving ? "Saving…" : opSaved ? "Saved" : "Save operator number"}
            </button>
            {opError ? <p className="text-[13px] text-red-500">{opError}</p> : null}
            {opSaved && !opError ? (
              <p className="text-[13px] text-emerald-600">Operator number updated.</p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Integrations</h3>

        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold text-foreground">Google Workspace</p>
              <p className="text-[13px] text-muted-foreground">Gmail + Calendar — last sync 2 minutes ago</p>
            </div>
            <span className="rounded-full border border-border px-3 py-0.5 text-[11px] font-medium text-muted-foreground">Connected</span>
          </div>

          <div className="rounded-lg border border-border bg-background px-4 py-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-[#25D366]" strokeWidth={1.75} />
              <p className="text-[13px] font-semibold text-foreground">AI Assistant WhatsApp Connection</p>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Link your phone number so the AI assistant can receive WhatsApp messages and route them through the pipeline.
            </p>
            <div className="mt-3 flex items-end gap-2">
              <label className="shrink-0 space-y-1 text-[13px]">
                <span className="font-medium text-foreground">Country</span>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="block w-[200px] rounded-lg border border-border bg-background px-2 py-2 text-[13px] text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={`${c.code}-${c.label}`} value={c.code}>
                      {c.flag} {c.label} ({c.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 flex-1 space-y-1 text-[13px]">
                <span className="font-medium text-foreground">Phone number</span>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="612345678"
                  className={inputCls + " block"}
                />
              </label>
              <button
                type="button"
                disabled={waSaving}
                onClick={saveWhatsAppNumber}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {waSaved ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : null}
                {waSaving ? "Saving\u2026" : waSaved ? "Saved" : "Save"}
              </button>
            </div>
            {waError ? (
              <p className="mt-2 text-[13px] text-red-500">{waError}</p>
            ) : null}
            {waSaved && !waError ? (
              <p className="mt-2 text-[13px] text-emerald-600">
                WhatsApp number linked — {countryCode}{phoneNumber}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Notifications ── */}
      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Notifications</h3>

        <div className="mt-5 space-y-2">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
            <span className="text-[13px] font-medium text-foreground">Drafts awaiting approval</span>
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-foreground" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
            <span className="text-[13px] font-medium text-foreground">Unfiled messages digest</span>
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-foreground" />
          </label>
        </div>
      </section>

      {/* ── AI & Tone ── */}
      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">AI & Tone</h3>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Upload a short style guide — Atelier retrieves it before drafting. Negative constraints are enforced in the orchestration layer.
        </p>
        <div className="mt-5">
          <button
            type="button"
            className="w-full rounded-lg border border-dashed border-border bg-background px-4 py-6 text-left text-[13px] font-medium text-muted-foreground transition hover:bg-accent/40 md:max-w-md"
          >
            Upload tone examples
          </button>
        </div>
      </section>

      {/* ── Developer Tools ── */}
      <section className="mt-10 mb-6">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Developer Tools</h3>
        <div className="mt-5 rounded-lg border border-border bg-background px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] shadow-md"
                style={{ background: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)" }}
              >
                <FlaskConical className="h-4 w-4 text-white" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-foreground">Simulate Incoming Lead</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Fire a test inquiry through{" "}
                  <span className="font-mono text-[11px]">webhook-web</span>{" "}
                  to validate the AI pipeline end-to-end.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fireTestLead}
              disabled={isSimulating}
              className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSimulating ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {isSimulating ? "Sending…" : "Send Test Lead"}
            </button>
          </div>
          {simResult && (
            <div
              className={cn(
                "mt-3 rounded-lg px-4 py-2 text-[13px]",
                simResult.ok
                  ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                  : "border border-red-500/20 bg-red-500/10 text-red-600",
              )}
            >
              {simResult.message}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
