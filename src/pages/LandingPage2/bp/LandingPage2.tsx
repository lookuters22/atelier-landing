import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ReactLenis, useLenis } from "lenis/react";
import "./landing2.css";

gsap.registerPlugin(ScrollTrigger);

/* ---------- small reusable icons ---------- */
const Arrow = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const Plus = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/* ---------- hero data ---------- */
const META = [
  { label: "Inbox status", value: <>Calm and categorized before your morning coffee</> },
  { label: "Average response", value: <><span className="num">2</span> min — your studio voice</> },
  { label: "Playbook rules", value: <>All your studio preferences securely logged</> },
  { label: "Escalations to you", value: <>Only when it matters</> },
];

const FAQ_ITEMS = [
  {
    q: "Does Ana actually send email on my behalf?",
    a: (
      <>
        <span className="serif">Never without your approval.</span>
        Ana drafts — you approve. Every reply is reviewed in your workspace and sent through your real Gmail account, from your real address. There is no auto-send, ever.
      </>
    ),
  },
  {
    q: "Can she really match my voice?",
    a: <>Absolutely. Ana is tuned to your signature studio persona using specific examples of your favorite conversations that you provide. She adopts your unique rhythm and warmth&mdash;writing like a seasoned member of your team rather than an assistant.</>,
  },
  {
    q: "What happens when a client asks something outside my rules?",
    a: <>Ana escalates — to WhatsApp by default — with the full context and her best read of the situation. Your decision becomes a new rule in your playbook, so the same question never reaches you twice.</>,
  },
  {
    q: "How do you handle my clients' data?",
    a: <>Email renders client-side from your live Gmail — we don't mirror a second copy in the cloud. Drafts are generated per-request and not retained for training. You can disconnect at any time and every derived trace goes with it.</>,
  },
  {
    q: "Does Ana work with Outlook, or iCloud?",
    a: <>While Ana does her best work within Gmail and Google Workspace, we understand that every studio has its own rhythm. We also offer custom integrations via IMAP to ensure your preferred email setup is beautifully supported.</>,
  },
  {
    q: "How much does she cost?",
    a: <>Ana is $480 per month for a single-photographer studio, billed annually, including onboarding and ongoing playbook curation. Multi-associate studios are quoted individually. Spots open in small, deliberate waves.</>,
  },
  {
    q: "When will Ana be live in my studio?",
    a: <>Ana can be ready to assist you today. The onboarding process is a guided journey within the app that captures your specific business rules and persona. It&apos;s a low-pressure, intuitive experience that you can complete quickly&mdash;once your briefing is finalized, Ana immediately steps into her role as your intelligent manager.</>,
  },
];

/* ---------- helpers to split text ---------- */
function splitWords(text: string): string[] {
  return text.split(/(\s+)/);
}

/* ---------- main page ---------- */
export function LandingPage2() {
  return (
    <ReactLenis
      root
      options={{
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1,
      }}
    >
      <LandingPage2Content />
    </ReactLenis>
  );
}

function LandingPage2Content() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const heroPreviewWrapRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  /* Keep ScrollTrigger animations in lockstep with Lenis's smooth scroll. */
  useLenis(() => {
    ScrollTrigger.update();
  });

  /* Force light theme & cream background while this page is mounted */
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const rootEl = document.getElementById("root");
    const prevHtmlBg = html.style.background;
    const prevBodyBg = body.style.background;
    const prevBodyOverflow = body.style.overflowX;
    const prevRootBg = rootEl?.style.background ?? "";
    const wasDark = !html.classList.contains("light");

    const cream = "#faf9f6";
    html.style.background = cream;
    html.style.colorScheme = "light";
    html.classList.add("light");
    body.style.background = cream;
    body.style.overflowX = "hidden";
    if (rootEl) rootEl.style.background = cream;

    return () => {
      html.style.background = prevHtmlBg;
      body.style.background = prevBodyBg;
      body.style.overflowX = prevBodyOverflow;
      if (rootEl) rootEl.style.background = prevRootBg;
      if (wasDark) html.classList.remove("light");
    };
  }, []);

  /* -------- GSAP timelines -------- */
  useEffect(() => {
    if (!rootRef.current) return;
    const root = rootRef.current;
    const ctx = gsap.context(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        gsap.set(".reveal-up, .reveal-fade", { clearProps: "all", opacity: 1, y: 0 });
        return;
      }

      /* Nav fade-in */
      gsap.from(".nav", {
        y: -32,
        opacity: 0,
        duration: 1.0,
        ease: "power3.out",
        delay: 0.1,
      });

      /* Hero headline: word-by-word stagger */
      gsap.from(".hero h1 .word", {
        yPercent: 110,
        opacity: 0,
        duration: 0.95,
        ease: "power4.out",
        stagger: 0.045,
        delay: 0.15,
      });

      /* Hero eyebrow + subhead + CTAs */
      gsap.from(".hero-eyebrow", { y: 14, opacity: 0, duration: 0.8, ease: "power3.out", delay: 0.05 });
      gsap.from(".hero-sub", { y: 18, opacity: 0, duration: 0.9, ease: "power3.out", delay: 0.55 });
      gsap.from(".hero-ctas > *", { y: 14, opacity: 0, duration: 0.7, ease: "power3.out", stagger: 0.08, delay: 0.7 });

      /* Hero meta strip — count-ups */
      gsap.from(".hero-meta > div", {
        y: 24,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.07,
        scrollTrigger: { trigger: ".hero-meta", start: "top 88%" },
      });
      root.querySelectorAll<HTMLElement>(".hm-value .num").forEach((el) => {
        const target = parseInt(el.textContent || "0", 10);
        if (!Number.isFinite(target) || target <= 0) return;
        const obj = { v: 0 };
        ScrollTrigger.create({
          trigger: el,
          start: "top 92%",
          once: true,
          onEnter: () => {
            gsap.to(obj, {
              v: target,
              duration: 1.6,
              ease: "power2.out",
              onUpdate: () => {
                el.textContent = String(Math.round(obj.v));
              },
            });
          },
        });
      });

      /* Hero preview reveal */
      gsap.from(".hero-preview", {
        y: 60,
        opacity: 0,
        scale: 0.985,
        duration: 1.2,
        ease: "power3.out",
        delay: 0.55,
      });

      /* Drifting orbs */
      gsap.to(".hero-orb.a", { y: 60, x: -40, duration: 9, repeat: -1, yoyo: true, ease: "sine.inOut" });
      gsap.to(".hero-orb.b", { y: -50, x: 30, duration: 11, repeat: -1, yoyo: true, ease: "sine.inOut" });

      /* Marquee — infinite horizontal */
      const marqueeTrack = root.querySelector<HTMLElement>(".marquee-track");
      if (marqueeTrack) {
        const distance = marqueeTrack.scrollWidth / 2;
        gsap.to(marqueeTrack, {
          x: -distance,
          duration: 40,
          ease: "none",
          repeat: -1,
        });
      }

      /* Generic reveal-up on scroll — fromTo so we override the CSS opacity:0 */
      root.querySelectorAll<HTMLElement>(".reveal-up").forEach((el) => {
        gsap.fromTo(
          el,
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.9,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 90%" },
          },
        );
      });
      root.querySelectorAll<HTMLElement>(".reveal-fade").forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0 },
          {
            opacity: 1,
            duration: 1.1,
            ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 92%" },
          },
        );
      });

      /* Section headings: word-stagger */
      root.querySelectorAll<HTMLElement>(".section-h, .s-calm-copy h2, .s-cta h2").forEach((heading) => {
        const words = heading.querySelectorAll(".word");
        if (!words.length) return;
        gsap.from(words, {
          yPercent: 110,
          opacity: 0,
          duration: 0.85,
          ease: "power4.out",
          stagger: 0.04,
          scrollTrigger: { trigger: heading, start: "top 85%" },
        });
      });

      /* Voice list items — staggered slide-in */
      gsap.from(".voice-item", {
        x: -32,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.1,
        scrollTrigger: { trigger: ".voice-list", start: "top 80%" },
      });

      /* Onboarding card faux-sticky:
         - Card stays a normal grid item (no position changes, ever).
         - We only translate it on Y as the section scrolls.
         - Because transforms never affect layout, there is no threshold,
           no pin spacer, no reparenting, no reflow → no jump, no strobe. */
      if (window.matchMedia("(min-width: 901px)").matches) {
        const cardEl = root.querySelector<HTMLElement>(".onboarding-card");
        const colEl = root.querySelector<HTMLElement>(".onboarding-col");
        const listEl = root.querySelector<HTMLElement>(".voice-list");
        if (cardEl && colEl && listEl) {
          const distance = () => Math.max(0, listEl.offsetHeight - cardEl.offsetHeight);
          gsap.to(cardEl, {
            y: distance,
            ease: "none",
            scrollTrigger: {
              trigger: colEl,
              start: "top top+=100",
              end: () => `+=${distance()}`,
              scrub: true,
              invalidateOnRefresh: true,
            },
          });
        }
      }

      /* Magic cards — staggered, with subtle parallax */
      const magicCards = root.querySelectorAll<HTMLElement>(".magic-card");
      magicCards.forEach((card, i) => {
        gsap.from(card, {
          y: 60,
          opacity: 0,
          duration: 0.9,
          ease: "power3.out",
          delay: i * 0.08,
          scrollTrigger: { trigger: card, start: "top 88%" },
        });
        gsap.to(card, {
          y: -10 * (i + 1),
          ease: "none",
          scrollTrigger: { trigger: card, start: "top bottom", end: "bottom top", scrub: true },
        });
      });

      /* Flow rail — reveal step by step + draw connecting line */
      gsap.from(".flow-step", {
        y: 50,
        opacity: 0,
        duration: 0.85,
        ease: "power3.out",
        stagger: 0.18,
        scrollTrigger: { trigger: ".flow-rail", start: "top 80%" },
      });

      /* FAQ rows — stagger reveal */
      gsap.from(".faq-item", {
        y: 24,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.07,
        scrollTrigger: { trigger: ".faq-list", start: "top 85%" },
      });

      /* Calm-section threaded preview — float */
      gsap.from(".threaded-preview .tp-row", {
        y: 18,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: { trigger: ".threaded-preview", start: "top 80%" },
      });

      /* Mega wordmark slow drift */
      gsap.to(".mega-wordmark", {
        x: -40,
        ease: "none",
        scrollTrigger: { trigger: ".s-cta", start: "top bottom", end: "bottom top", scrub: 1 },
      });

      /* Nav background shift on scroll past hero */
      ScrollTrigger.create({
        trigger: ".hero",
        start: "bottom top",
        onEnter: () => navRef.current?.classList.add("nav-solid"),
        onLeaveBack: () => navRef.current?.classList.remove("nav-solid"),
      });
    }, root);

    /* Once custom fonts have loaded, recompute every trigger position
       (font swap can shift section heights by tens of pixels). */
    const refresh = () => ScrollTrigger.refresh();
    if (document.fonts && typeof document.fonts.ready?.then === "function") {
      document.fonts.ready.then(refresh).catch(() => undefined);
    }
    const t = window.setTimeout(refresh, 600);
    window.addEventListener("load", refresh);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("load", refresh);
      ctx.revert();
    };
  }, []);

  /* Cursor-tracking glow on hero preview + magic cards */
  const handlePreviewMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  /* Inbox active thread state */
  const [activeThread, setActiveThread] = useState(0);
  const threads = [
    { from: "Margot Beckett", time: "08:14", subj: "Positano wedding — September 2026", snip: "\"We adored your Lake Como work. Can you share availability and pricing…\"", tags: [{ k: "fin" as const, t: "Draft ready" }, { k: "new" as const, t: "New inquiry" }] },
    { from: "Hartwell Studio", time: "07:48", subj: "Second photographer request — mid-contract", snip: "\"Thinking through whether we add a second shooter for the reception…\"", tags: [{ k: "esc" as const, t: "Escalated" }] },
    { from: "Noor & Elias", time: "Yesterday", subj: "Deposit received — locking the date", snip: "\"Confirmation of 30% deposit, see attached transfer receipt.\"", tags: [{ k: "ready" as const, t: "Replied" }] },
    { from: "Thorne Family", time: "Yesterday", subj: "Follow-up on album sizes", snip: "\"One more question before we finalise — is 12×12 available in linen?\"", tags: [{ k: "stale" as const, t: "Draft stale" }, { k: "fin" as const, t: "Rewriting" }] },
    { from: "Savannah Hale", time: "Tue", subj: "Travel surcharge — 40 miles of Nashville", snip: "\"Rule applied from your playbook; draft ready for your review.\"", tags: [{ k: "fin" as const, t: "Draft ready" }] },
  ];

  /* Onboarding toggles state */
  const [toggles, setToggles] = useState<boolean[]>([true, true, false]);
  const flipToggle = (i: number) => setToggles((arr) => arr.map((v, idx) => (idx === i ? !v : v)));

  /* FAQ accordion */
  const [openFaq, setOpenFaq] = useState<number>(0);

  return (
    <>
      <div ref={rootRef} className="ana2-root">
        {/* ============== NAV ============== */}
        <nav ref={navRef as React.RefObject<HTMLElement>} className="nav">
          <div className="nav-inner">
            <div className="nav-logo">Ana<span className="dot">.</span></div>
            <div className="nav-links">
              <a href="#workspace">Workspace</a>
              <a href="#voice">Voice</a>
              <a href="#moments">Craft</a>
              <a href="#flow">Flow</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="nav-cta">
              <span className="nav-ping"><span className="pulse" />Accepting studios — Q3</span>
              <a className="btn-hero-secondary" style={{ height: 40, padding: "0 16px", fontSize: 14 }} href="#cta">Request access</a>
            </div>
          </div>
        </nav>

        {/* ============== HERO ============== */}
        <header className="hero">
          <div className="hero-orb a" />
          <div className="hero-orb b" />
          <div className="container-wide">
            <span className="hero-eyebrow"><span className="fdot" />Ana — studio manager, on staff since the day you open her</span>

            <h1>
              {splitWords("The AI manager, ").map((w, i) => (
                <span key={`a${i}`} className="word">{w}</span>
              ))}
              <span className="word"><span className="serif-em">crafted</span></span>
              {splitWords(" for luxury wedding photographers.").map((w, i) => (
                <span key={`b${i}`} className="word">{w}</span>
              ))}
            </h1>

            <p className="hero-sub">
              Ana turns a chaotic inbox into a calm, intelligent workspace. She reads, routes, and drafts replies in your exact studio voice — always within your pricing, travel, and scheduling rules — so you can step away from the screen and back behind the lens.
            </p>

            <div className="hero-ctas">
              <a className="btn-hero-primary" href="#cta">Meet Ana <Arrow /></a>
              <a className="btn-hero-secondary" href="#workspace">See how she thinks</a>
            </div>

            <div className="hero-meta">
              {META.map((m) => (
                <div key={m.label}>
                  <div className="hm-label">{m.label}</div>
                  <div className="hm-value">{m.value}</div>
                </div>
              ))}
            </div>

            {/* Workspace preview */}
            <div className="hero-preview-wrap" id="workspace" ref={heroPreviewWrapRef} onMouseMove={handlePreviewMove}>
              <div className="hero-preview-glow" />
              <div className="hero-preview">
                <div className="hp-chrome">
                  <div className="hp-dot" /><div className="hp-dot" /><div className="hp-dot" />
                  <div className="hp-url">ana.studio / inbox / beckett-inquiry</div>
                </div>
                <div className="hp-app">
                  <aside className="hp-side">
                    <div className="hp-brand"><span className="hp-brand-wm">Ana<span className="dot">.</span></span></div>
                    <div className="hp-grouplabel">Today</div>
                    <div className="hp-nav active">
                      <svg viewBox="0 0 24 24"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" /></svg>
                      Inbox <span className="count">24</span>
                    </div>
                    <div className="hp-nav">
                      <svg viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
                      Drafted <span className="count">9</span>
                    </div>
                    <div className="hp-nav">
                      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                      Awaiting reply <span className="count">6</span>
                    </div>
                    <div className="hp-nav">
                      <svg viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                      Escalated <span className="count">2</span>
                    </div>
                    <div className="hp-grouplabel">Studio</div>
                    <div className="hp-nav">
                      <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                      Playbook <span className="count">37</span>
                    </div>
                    <div className="hp-nav">
                      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      Calendar
                    </div>
                  </aside>

                  <div className="hp-inbox">
                    <div className="hp-inbox-head">
                      <div className="hp-inbox-title">Inbox</div>
                      <div className="hp-tabs">
                        <div className="hp-tab active">All <span className="c">24</span></div>
                        <div className="hp-tab">Inquiries <span className="c">6</span></div>
                        <div className="hp-tab">Booked <span className="c">11</span></div>
                      </div>
                    </div>
                    <div className="hp-threads">
                      {threads.map((t, i) => (
                        <div
                          key={t.from}
                          className={`hp-thread${activeThread === i ? " active" : ""}`}
                          onClick={() => setActiveThread(i)}
                        >
                          <div className="hp-thread-top">
                            <div className="hp-thread-from">{t.from}</div>
                            <div className="hp-thread-time">{t.time}</div>
                          </div>
                          <div className="hp-thread-subj">{t.subj}</div>
                          <div className="hp-thread-snip">{t.snip}</div>
                          <div className="hp-thread-tags">
                            {t.tags.map((tag) => (
                              <span key={tag.t} className={`pill ${tag.k}`}>{tag.k !== "new" && <span className="dot" />}{tag.t}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="hp-reader">
                    <div className="hp-reader-head">
                      <div className="hp-reader-subj">Positano wedding — September 2026</div>
                      <div className="hp-reader-meta">Inquiry · Margot Beckett · 4 messages</div>
                    </div>
                    <div className="hp-reader-body">
                      <div className="hp-msg">
                        <div className="hp-msg-head">
                          <div className="hp-msg-av">MB</div>
                          <div className="hp-msg-from">Margot Beckett</div>
                          <div className="hp-msg-time">08:14</div>
                        </div>
                        <div className="hp-msg-body">Hi — we adored your Lake Como work and are planning a small ceremony in Positano, Saturday 14 September 2026. Roughly 40 guests. Could you share availability and pricing for a two-day package?</div>
                      </div>

                      <div className="hp-draft">
                        <div className="hp-draft-head">
                          <span style={{ width: 6, height: 6, borderRadius: 999, background: "white" }} />
                          Ana drafted — ready to send
                        </div>
                        <div className="hp-draft-body">
                          <div className="hp-draft-text">Margot — thank you for the kind note. Saturday, 14 September 2026 is open for us, and Positano is a setting we love returning to. Our two-day editorial package begins at $28,000, inclusive of a rehearsal-dinner half-day and a full wedding-day coverage. I've attached a quiet overview of the work we've made in the region. Shall we hold the date provisionally while we find a time to talk?</div>
                          <div className="hp-draft-rules">
                            <span className="hp-rule"><span className="chk">✓</span>Pricing · Tier A · Italy</span>
                            <span className="hp-rule"><span className="chk">✓</span>Travel policy · EU · no surcharge</span>
                            <span className="hp-rule"><span className="chk">✓</span>Voice · warm / measured</span>
                            <span className="hp-rule"><span className="chk">✓</span>Calendar · Sep 14 · open</span>
                          </div>
                          <div className="hp-draft-actions">
                            <button className="hp-btn primary">Send via Gmail</button>
                            <button className="hp-btn ghost">Edit draft</button>
                            <button className="hp-btn ghost">Ask Ana to rewrite</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ============== Marquee strip ============== */}
        <div className="marquee">
          <div className="marquee-track">
            {[...Array(2)].map((_, group) => (
              <div key={group} style={{ display: "flex", gap: 64 }}>
                <span className="marquee-item">Gmail-native rendering</span>
                <span className="marquee-item">Drafts reviewed in your real voice</span>
                <span className="marquee-item">No auto-send, ever</span>
                <span className="marquee-item">Escalations to WhatsApp</span>
                <span className="marquee-item">Continuously learning playbook</span>
                <span className="marquee-item">Built for luxury wedding studios</span>
                <span className="marquee-item">Disconnect any time, traces removed</span>
              </div>
            ))}
          </div>
        </div>

        {/* ============== SECTION 1 — CALM INBOX ============== */}
        <section className="s-calm">
          <div className="container-wide">
            <div className="section-eyebrow reveal-fade">01 · A clean workspace</div>
            <div className="s-calm-grid">
              <div className="s-calm-copy">
                <h2>
                  {splitWords("One calm inbox. ").map((w, i) => (<span key={`c1${i}`} className="word">{w}</span>))}
                  <span className="word"><span className="serif-em">No precious</span></span>
                  {splitWords(" context lost.").map((w, i) => (<span key={`c2${i}`} className="word">{w}</span>))}
                </h2>
                <p className="reveal-up">You don't need another app complicating your day — you need the inbox you already have to feel beautifully intuitive. Ana connects directly to Gmail and renders standard emails as clean, readable conversation threads.</p>
                <div className="tech-flex reveal-up">
                  <div className="tech-flex-label">The tech, quietly</div>
                  <p>Lightweight, client-side rendering for email sync. Messages pull and organise with lightning speed. Secure by default, fast, and streamlined — no unnecessary cloud bloat, no second copy of your data.</p>
                </div>
              </div>

              <div className="threaded-preview">
                <div className="tp-head">
                  <div className="tp-subj">Thorne wedding — album finishing</div>
                  <div className="tp-meta">Gmail · threaded</div>
                </div>
                <div className="tp-row">
                  <div className="tp-av">TH</div>
                  <div className="tp-body">
                    <div className="tp-from"><div className="tp-name">Eleanor Thorne</div><div className="tp-time">Mon 09:12</div></div>
                    <div className="tp-text">One more question before we finalise — is 12×12 available in linen, or only the silk?</div>
                  </div>
                </div>
                <div className="tp-row">
                  <div className="tp-av fin">A</div>
                  <div className="tp-body">
                    <div className="tp-from"><div className="tp-name">Ana · draft for your review</div><div className="tp-time">Mon 09:14</div></div>
                    <div className="tp-text draft">Eleanor — yes, 12×12 is available in our Belgian linen, in ivory or bone. I'll hold both swatches aside for your next visit. Silk remains the default for the signature collection.</div>
                  </div>
                </div>
                <div className="tp-row">
                  <div className="tp-av">TH</div>
                  <div className="tp-body">
                    <div className="tp-from"><div className="tp-name">Eleanor Thorne</div><div className="tp-time">Mon 10:02</div></div>
                    <div className="tp-text">Actually — could we swap the cover to cream leather? Last thought, I promise.</div>
                  </div>
                </div>
                <div className="tp-row">
                  <div className="tp-av fin">A</div>
                  <div className="tp-body">
                    <div className="tp-from"><div className="tp-name">Ana</div><div className="tp-time">Mon 10:02</div></div>
                    <div className="tp-text" style={{ color: "var(--color-fin)" }}>Draft invalidated — Eleanor's follow-up changes the answer. Rewriting.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============== SECTION 2 — VOICE & BOUNDARIES ============== */}
        <section className="s-voice" id="voice">
          <div className="container-wide">
            <div className="section-eyebrow reveal-fade">02 · Your voice, your boundaries</div>
            <h2 className="section-h">
              {splitWords("Your precise judgment. ").map((w, i) => (<span key={`v1${i}`} className="word">{w}</span>))}
              <span className="word"><span className="serif-em">Your signature</span></span>
              {splitWords(" warmth.").map((w, i) => (<span key={`v2${i}`} className="word">{w}</span>))}
            </h2>
            <p className="section-lead reveal-up">Most AI guesses what to say next. Ana is heavily constrained by your reality. During a thoughtful onboarding, she learns your core services, your travel boundaries, and your exact scheduling matrix — then holds the line.</p>

            <div className="s-voice-grid">
              <div className="voice-list">
                <div className="voice-item">
                  <div className="voice-num">01</div>
                  <div>
                    <div className="voice-h">True voice</div>
                    <div className="voice-p">Tuned to your exact studio persona and warmth using your own favorite communication examples. She writes the way you write, not the way an assistant writes.</div>
                  </div>
                </div>
                <div className="voice-item">
                  <div className="voice-num">02</div>
                  <div>
                    <div className="voice-h">Strict boundaries</div>
                    <div className="voice-p">Replies are drafted entirely within your pricing and availability. She knows instinctively when a topic is off-limits without your explicit permission.</div>
                  </div>
                </div>
                <div className="voice-item">
                  <div className="voice-num">03</div>
                  <div>
                    <div className="voice-h">Beautiful organisation</div>
                    <div className="voice-p">Ana sorts inquiries, active clients, and unlinked threads before you open your laptop. Your morning begins curated, not triaged.</div>
                  </div>
                </div>
                <div className="voice-item">
                  <div className="voice-num">04</div>
                  <div>
                    <div className="voice-h">Kind firmness</div>
                    <div className="voice-p">When a request falls outside your rules, she declines gracefully on your behalf — in your language, with your dignity intact.</div>
                  </div>
                </div>
              </div>

              <div className="onboarding-col">
              <div className="onboarding-card">
                <div className="ob-head">
                  <div className="ob-title">Studio onboarding</div>
                  <div className="ob-step">Step 03 of 07</div>
                </div>

                <div className="ob-group">
                  <div className="ob-label">Travel policy</div>
                  <div className="ob-row">
                    <div className="ob-row-l">
                      <div className="ob-row-title">Surcharge-free radius</div>
                      <div className="ob-row-sub">50 miles of Nashville</div>
                    </div>
                    <button type="button" aria-label="Toggle surcharge-free radius" className={`ob-toggle${toggles[0] ? " on" : ""}`} onClick={() => flipToggle(0)} />
                  </div>
                  <div className="ob-row">
                    <div className="ob-row-l">
                      <div className="ob-row-title">Destination — Europe</div>
                      <div className="ob-row-sub">Flat fee, no per-mile</div>
                    </div>
                    <button type="button" aria-label="Toggle destination Europe" className={`ob-toggle${toggles[1] ? " on" : ""}`} onClick={() => flipToggle(1)} />
                  </div>
                  <div className="ob-row">
                    <div className="ob-row-l">
                      <div className="ob-row-title">Destination — Asia &amp; Pacific</div>
                      <div className="ob-row-sub">Quote-on-request</div>
                    </div>
                    <button type="button" aria-label="Toggle destination Asia & Pacific" className={`ob-toggle${toggles[2] ? " on" : ""}`} onClick={() => flipToggle(2)} />
                  </div>
                </div>

                <div className="ob-group">
                  <div className="ob-label">Pricing tiers</div>
                  <div className="ob-chip-row">
                    <div className="ob-chip on">Tier A · $28k+</div>
                    <div className="ob-chip on">Tier B · $18k</div>
                    <div className="ob-chip">Tier C · $12k</div>
                    <div className="ob-chip">Elopement</div>
                  </div>
                </div>

                <div className="ob-group">
                  <div className="ob-label">Tone — a line Ana should sound like</div>
                  <div className="ob-field">"Saturday, 14 September is ours to keep. Positano is a setting we love returning to<span className="cursor" />"</div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============== SECTION 3 — MAGIC MOMENTS ============== */}
        <section className="s-magic" id="moments">
          <div className="container-wide">
            <div className="section-eyebrow reveal-fade">03 · White-glove magic moments</div>
            <h2 className="section-h">
              {splitWords("Three ways Ana ").map((w, i) => (<span key={`m1${i}`} className="word">{w}</span>))}
              <span className="word"><span className="serif-em">steps back,</span></span>
              {splitWords(" on purpose.").map((w, i) => (<span key={`m2${i}`} className="word">{w}</span>))}
            </h2>

            <div className="magic-grid">
              <article className="magic-card" onMouseMove={handlePreviewMove}>
                <div className="magic-num">Card 01</div>
                <div className="magic-eyebrow">Stale-draft protection</div>
                <h3 className="magic-h">White-glove restraint</h3>
                <p className="magic-p">If Ana drafts a reply and your client sends another message before you approve it, she instantly invalidates the old draft. You will never accidentally send outdated information.</p>
                <div className="magic-demo">
                  <div className="demo-stale">
                    <div className="old">Eleanor — yes, 12×12 in Belgian linen, in ivory or bone…</div>
                    <div className="new">Eleanor — happy to swap the cover to cream leather. I'll set aside two finishes for your next visit.</div>
                  </div>
                </div>
              </article>

              <article className="magic-card" onMouseMove={handlePreviewMove}>
                <div className="magic-num">Card 02</div>
                <div className="magic-eyebrow">Smart interruptions</div>
                <h3 className="magic-h">The escalation engine</h3>
                <p className="magic-p">When a conversation needs your delicate touch or falls outside standard policy, Ana steps back — and escalates the context directly to you on WhatsApp for a final decision.</p>
                <div className="magic-demo">
                  <div className="demo-esc">
                    <div className="ana-line"><span className="d" />Ana · WhatsApp · 10:42</div>
                    <div className="chat">The Hartwells are asking about a second photographer mid-contract — outside your policy. Context + draft attached. Your call.</div>
                    <div className="chat-meta">Read · 10:44</div>
                  </div>
                </div>
              </article>

              <article className="magic-card" onMouseMove={handlePreviewMove}>
                <div className="magic-num">Card 03</div>
                <div className="magic-eyebrow">Continuous learning</div>
                <h3 className="magic-h">Asynchronous luxury</h3>
                <p className="magic-p">When you step in to handle an edge case, Ana quietly logs your decision. A one-off fix today becomes a permanent rule in your studio's playbook tomorrow.</p>
                <div className="magic-demo">
                  <div className="demo-pb">
                    <div className="rule"><span className="n">31</span><span className="t">Waive travel surcharge inside 50 miles of Nashville</span></div>
                    <div className="rule"><span className="n">32</span><span className="t">Decline mid-contract coverage changes without approval</span></div>
                    <div className="rule new"><span className="n">37</span><span className="t">Offer linen-cover upgrade for Tier A albums</span></div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ============== SECTION 4 — FLOW ============== */}
        <section className="s-flow" id="flow">
          <div className="container-wide">
            <div className="section-eyebrow reveal-fade">04 · A peaceful, governed workflow</div>
            <h2 className="section-h">
              {splitWords("Complete safety, ").map((w, i) => (<span key={`f1${i}`} className="word">{w}</span>))}
              <span className="word"><span className="serif-em">without the drag.</span></span>
            </h2>
            <p className="section-lead reveal-up">An AI should never make a mistake on your behalf. Ana operates on a strictly governed, deeply respectful approval system — three quiet steps between a joyful inquiry and a beautifully-sent reply.</p>

            <div className="flow-rail">
              <div className="flow-step">
                <div className="flow-num"><span className="dot" />01 · Ingest</div>
                <h4>A couple emails a joyful inquiry.</h4>
                <p>Ana categorises it instantly — inquiry, booked client, vendor, unlinked — and pulls the relevant context from your playbook.</p>
                <div className="flow-tile">
                  <div className="flow-tile-top">
                    <div className="flow-tile-av">MB</div>
                    <div className="flow-tile-name">Margot Beckett</div>
                    <div className="flow-tile-time">08:14</div>
                  </div>
                  <div className="flow-tile-body">Positano wedding — September 2026. Roughly 40 guests. Could you share availability and pricing?</div>
                  <div className="flow-tile-actions">
                    <span className="flow-tile-btn" style={{ color: "var(--color-fin)", borderColor: "var(--color-fin)" }}>Inquiry · Tier A</span>
                  </div>
                </div>
              </div>

              <div className="flow-step">
                <div className="flow-num"><span className="dot" />02 · Draft</div>
                <h4>Ana writes the perfect response.</h4>
                <p>She checks the playbook, matches your voice, and drafts a reply that honours every pricing, travel, and scheduling rule you've set.</p>
                <div className="flow-tile">
                  <div className="flow-tile-top">
                    <div className="flow-tile-av fin">A</div>
                    <div className="flow-tile-name">Ana · drafted</div>
                    <div className="flow-tile-time">08:15</div>
                  </div>
                  <div className="flow-tile-body draft">Margot — thank you for the kind note. Saturday, 14 September 2026 is open for us, and Positano is a setting we love returning to…</div>
                  <div className="flow-tile-actions">
                    <span className="flow-tile-btn">4 rules applied</span>
                    <span className="flow-tile-btn">Voice · warm</span>
                  </div>
                </div>
              </div>

              <div className="flow-step">
                <div className="flow-num"><span className="dot" />03 · Approve</div>
                <h4>You review in your calm UI.</h4>
                <p>One simple click, and it sends beautifully via your real Gmail — from your real address, in your real voice.</p>
                <div className="flow-tile">
                  <div className="flow-tile-top">
                    <div className="flow-tile-av">YOU</div>
                    <div className="flow-tile-name">Reviewed &amp; sent</div>
                    <div className="flow-tile-time">08:22</div>
                  </div>
                  <div className="flow-tile-body">Sent via Gmail · replies now route straight to your inbox.</div>
                  <div className="flow-tile-actions">
                    <span className="flow-tile-btn primary">Sent</span>
                    <span className="flow-tile-btn">Thread watching</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============== FAQ ============== */}
        <section className="s-faq" id="faq">
          <div className="container-wide">
            <div className="section-eyebrow reveal-fade">05 · Frequently asked</div>
            <div className="faq-grid">
              <div>
                <h2 className="section-h" style={{ fontSize: "clamp(40px, 4.4vw, 56px)", letterSpacing: "-1.6px" }}>
                  {splitWords("Questions, ").map((w, i) => (<span key={`q1${i}`} className="word">{w}</span>))}
                  <span className="word"><span className="serif-em">answered gently.</span></span>
                </h2>
                <p className="section-lead reveal-up">Still deciding? The answers below are the ones studios ask in the first call. If something else is on your mind, write to <a href="mailto:hello@ana.studio" style={{ color: "var(--fg-1)", textDecoration: "underline", textUnderlineOffset: "3px" }}>hello@ana.studio</a>.</p>
              </div>

              <div className="faq-list">
                {FAQ_ITEMS.map((item, i) => {
                  const open = openFaq === i;
                  return (
                    <div key={item.q} className={`faq-item${open ? " open" : ""}`}>
                      <button className="faq-q" onClick={() => setOpenFaq(open ? -1 : i)}>
                        <span className="num">{String(i + 1).padStart(2, "0")}</span>
                        {item.q}
                        <span className="caret"><Plus /></span>
                      </button>
                      <div className="faq-a">
                        <div>
                          <div className="faq-a-inner">{item.a}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ============== CTA FOOTER ============== */}
        <section className="s-cta" id="cta">
          <div className="container-wide s-cta-inner">
            <span className="s-cta-eyebrow"><span className="d" />The romantic close</span>
            <h2>
              {splitWords("Reclaim your ").map((w, i) => (<span key={`r1${i}`} className="word">{w}</span>))}
              <span className="word"><span className="serif-em">creative</span></span>
              {splitWords(" time.").map((w, i) => (<span key={`r2${i}`} className="word">{w}</span>))}
            </h2>
            <p className="s-cta-sub reveal-up">Let Ana handle the logistics with grace. You focus on the art — the light, the quiet moment between a vow and a breath.</p>
            <a className="s-cta-btn reveal-up" href="#">Secure your studio's spot <Arrow size={18} /></a>
            <div className="mega-wordmark">Ana<span className="dot">.</span></div>
          </div>
        </section>

        {/* ============== FOOTER ============== */}
        <footer className="footer">
          <div className="container-wide footer-inner">
            <div className="footer-logo">Ana<span className="dot">.</span></div>
            <div className="footer-links">
              <a href="#workspace">Workspace</a>
              <a href="#voice">Voice</a>
              <a href="#moments">Craft</a>
              <a href="#faq">FAQ</a>
              <a href="mailto:hello@ana.studio">hello@ana.studio</a>
            </div>
            <div className="footer-legal">© 2026 · Ana Studio · Made quietly</div>
          </div>
        </footer>
      </div>
    </>
  );
}

export default LandingPage2;
