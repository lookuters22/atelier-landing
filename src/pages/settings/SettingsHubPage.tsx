import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, FlaskConical, MessageCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
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

  useEffect(() => {
    if (!photographerId) return;
    supabase
      .from("photographers")
      .select("settings")
      .eq("id", photographerId)
      .single()
      .then(({ data }) => {
        const settings = (data?.settings ?? {}) as Record<string, unknown>;
        const saved = (settings.whatsapp_number as string) ?? "";
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
      });
  }, [photographerId]);

  async function saveWhatsAppNumber() {
    if (!photographerId) return;
    setWaSaving(true);
    setWaError(null);
    setWaSaved(false);

    const fullNumber = phoneNumber.trim() ? `${countryCode}${phoneNumber.trim().replace(/^0+/, "")}` : "";

    try {
      const { data: current } = await supabase
        .from("photographers")
        .select("settings")
        .eq("id", photographerId)
        .single();

      const existing = (current?.settings ?? {}) as Record<string, unknown>;

      const { error } = await supabase
        .from("photographers")
        .update({ settings: { ...existing, whatsapp_number: fullNumber || null } })
        .eq("id", photographerId);

      if (error) throw error;
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
      const { error } = await supabase.functions.invoke("webhook-web", {
        body: {
          source: "test_button",
          photographer_id: photographerId,
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
        <p className="mt-3 text-[13px] text-muted-foreground">Studio identity and connectivity.</p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Display name</span>
            <input defaultValue="Atelier · Elena Duarte" className={inputCls} />
          </label>
          <label className="space-y-1.5 text-[13px]">
            <span className="font-medium text-foreground">Default currency</span>
            <input defaultValue="EUR" className={inputCls} />
          </label>
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
