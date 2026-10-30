import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarX,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  Eye,
  FileText,
  Gift,
  Globe,
  Inbox,
  MapPin,
  Menu,
  MousePointerClick,
  Percent,
  Send,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { COPY, HTML_LANG, LANG_LABEL, formatSum, type Copy, type Lang } from "@/lib/i18n";
import { Phone, Screen } from "@/components/Screen";
import { cn, PHONE } from "@/lib/utils";

const REGISTER = "https://hormang.co.uz/auth/register?role=provider";
const TG = "https://t.me/hormang_web_bot";
const LOGIN = "https://hormang.co.uz/auth/login";
const MAIN = "https://hormang.co.uz";
const S = (n: string) => `${import.meta.env.BASE_URL}screens/${n}`;
const LANG_KEY = "hormang-lang";

function readLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q && q in COPY) return q as Lang;
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && saved in COPY) return saved as Lang;
  } catch { /* storage unavailable */ }
  return "uz";
}

function TgIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13 1.4 11.5c-1-.3-1-1 .2-1.5L20.5 2.8c.9-.3 1.6.2 1.4 1.5Z" />
    </svg>
  );
}

const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-6 py-3.5 font-semibold text-primary-foreground shadow-brand transition-[transform,filter,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98] select-none cursor-pointer",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-3.5 font-semibold text-foreground transition-[transform,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:border-primary/40 active:translate-y-0 active:scale-[0.98] select-none cursor-pointer",
  light:
    "inline-flex items-center justify-center gap-2 rounded-2xl bg-card px-6 py-3.5 font-semibold text-primary transition-[transform,background-color] duration-150 ease-out hover:-translate-y-0.5 hover:bg-white active:translate-y-0 active:scale-[0.98] select-none cursor-pointer",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-2xl border border-primary-foreground/40 px-6 py-3.5 font-semibold text-primary-foreground transition-[transform,background-color] duration-150 ease-out hover:bg-primary-foreground/10 active:scale-[0.98] select-none cursor-pointer",
};

function Cta({ t, variant = "primary", label, className }: { t: Copy; variant?: keyof typeof btn; label?: string; className?: string }) {
  return (
    <a href={REGISTER} className={cn(btn[variant], className)}>
      {label ?? t.hero.register}
    </a>
  );
}

function TgBtn({ t, variant = "secondary", className }: { t: Copy; variant?: keyof typeof btn; className?: string }) {
  return (
    <a href={TG} target="_blank" rel="noopener noreferrer" className={cn(btn[variant], className)}>
      <TgIcon className="size-5" /> {t.hero.telegram}
    </a>
  );
}

function H2({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("reveal text-3xl font-extrabold tracking-tight md:text-4xl", className)}>{children}</h2>;
}

export default function App() {
  const [lang, setLang] = useState<Lang>(readLang);
  const t = COPY[lang];

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
    document.title = t.meta.title;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch { /* storage unavailable */ }
  }, [lang, t]);

  useEffect(() => {
    const els = document.querySelectorAll(".reveal:not(.in)");
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [lang]);

  return (
    <div className="min-h-dvh bg-background pb-28 text-foreground md:pb-0">
      <Nav t={t} lang={lang} setLang={setLang} />
      <main>
        {/* Hero: Desktop vs Dedicated Mobile */}
        <HeroDesktop t={t} />
        <HeroMobile t={t} />

        {/* What is Hormang: Desktop vs Mobile */}
        <WhatDesktop t={t} />
        <WhatMobile t={t} />

        {/* How it works: Desktop Sticky Scroll vs Mobile Interactive Stepper */}
        <HowDesktop t={t} />
        <HowMobile t={t} />

        {/* Tanga & Earnings Calculator: Desktop vs Mobile Fintech Card */}
        <TangaDesktop t={t} />
        <TangaMobile t={t} />

        {/* Profile: Desktop vs Mobile Segmented Showcase */}
        <ProfileDesktop t={t} />
        <ProfileMobile t={t} />

        {/* Why Hormang: Desktop Table vs Mobile Versus Cards */}
        <WhyDesktop t={t} />
        <WhyMobile t={t} />

        {/* Start 5 Steps: Desktop Grid vs Mobile Checklist */}
        <StartDesktop t={t} />
        <StartMobile t={t} />

        {/* FAQ */}
        <Faq t={t} />

        {/* Final CTA */}
        <Final t={t} />
      </main>
      <Footer t={t} />

      {/* Mobile Sticky Bottom CTA */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-md md:hidden shadow-lg"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center gap-2">
          <a href={REGISTER} className={cn(btn.primary, "flex-1 py-3 text-sm font-bold")}>
            <span>{t.nav.cta}</span>
            <ArrowRight className="size-4" />
          </a>
          <a
            href={TG}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(btn.secondary, "px-3.5 py-3 text-sm shrink-0")}
            aria-label="Telegram"
          >
            <TgIcon className="size-5 text-telegram" />
          </a>
        </div>
      </div>
    </div>
  );
}

function Nav({ t, lang, setLang }: { t: Copy; lang: Lang; setLang: (l: Lang) => void }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 12);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors duration-200 border-b",
        scrolled
          ? "border-border/80 bg-background/90 shadow-sm backdrop-blur-md"
          : "border-border/50 bg-background/70 backdrop-blur-sm",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <a href="#" className="flex items-center gap-2 font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl">
          <img src={S("hormang-logo.png")} alt="" width={32} height={32} className="size-8 rounded-lg shadow-sm" />
          <span className="text-lg tracking-tight">Hormang</span>
        </a>

        {/* Desktop Navigation */}
        <nav className="ml-6 hidden gap-6 text-sm font-medium text-muted-foreground lg:flex">
          <a href="#qanday" className="transition hover:text-foreground">{t.nav.how}</a>
          <a href="#tanga" className="transition hover:text-foreground">{t.nav.tanga}</a>
          <a href="#profil" className="transition hover:text-foreground">{t.nav.profile}</a>
          <a href="#savollar" className="transition hover:text-foreground">{t.nav.faq}</a>
        </nav>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <a href={MAIN} className="hidden text-sm font-medium text-muted-foreground hover:text-primary transition sm:block">
            {t.nav.customer}
          </a>

          {/* Styled Language Selector */}
          <div className="relative flex items-center">
            <label htmlFor="lang" className="sr-only">Til / Язык / Language</label>
            <div className="relative flex items-center">
              <Globe className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
              <select
                id="lang"
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="h-9 rounded-xl border border-border bg-card pl-8 pr-7 text-xs font-semibold text-foreground shadow-sm transition hover:border-primary/40 focus:border-primary focus:outline-none appearance-none cursor-pointer"
              >
                {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
                  <option key={l} value={l}>
                    {LANG_LABEL[l]}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground" />
            </div>
          </div>

          <a
            href={REGISTER}
            className="hidden rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-primary-foreground shadow-brand transition-[transform,filter] duration-150 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98] md:inline-flex"
          >
            {t.nav.cta}
          </a>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="grid size-10 place-items-center rounded-xl border border-border bg-card text-foreground transition hover:bg-muted active:scale-95 lg:hidden cursor-pointer"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="border-b border-border bg-card/98 px-4 py-5 shadow-xl backdrop-blur-lg lg:hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col gap-3 font-medium text-base">
            <a
              href="#qanday"
              onClick={closeMenu}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-muted transition"
            >
              <span>{t.nav.how}</span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </a>
            <a
              href="#tanga"
              onClick={closeMenu}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-muted transition"
            >
              <span>{t.nav.tanga}</span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </a>
            <a
              href="#profil"
              onClick={closeMenu}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-muted transition"
            >
              <span>{t.nav.profile}</span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </a>
            <a
              href="#savollar"
              onClick={closeMenu}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-muted transition"
            >
              <span>{t.nav.faq}</span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </a>
            <hr className="my-1 border-border" />
            <a
              href={MAIN}
              onClick={closeMenu}
              className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-primary hover:bg-muted transition"
            >
              <span>{t.nav.customer}</span>
              <ArrowRight className="size-4 text-primary" />
            </a>
            <div className="pt-2 flex flex-col gap-2">
              <a
                href={REGISTER}
                className={cn(btn.primary, "w-full justify-center text-sm py-3")}
              >
                {t.nav.cta}
              </a>
              <a
                href={TG}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(btn.secondary, "w-full justify-center text-sm py-3")}
              >
                <TgIcon className="size-4 text-telegram" /> {t.hero.telegram}
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

/* =========================================================================
   1. HERO SECTION
   ========================================================================= */

/** Desktop Hero (hidden on mobile) */
function HeroDesktop({ t }: { t: Copy }) {
  return (
    <section className="relative hidden md:block overflow-hidden">
      <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-brand opacity-10 blur-3xl" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:py-20 md:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-provider-soft px-3.5 py-1.5 text-xs font-bold text-provider border border-provider/20 shadow-xs">
            <MapPin className="size-3.5" /> {t.hero.pill}
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            <span className="text-brand">{t.hero.h1}</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">{t.hero.sub}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Cta t={t} />
            <TgBtn t={t} />
          </div>
          <ul className="mt-8 grid gap-2.5 text-sm font-medium sm:grid-cols-3">
            {t.hero.checks.map((c) => (
              <li key={c} className="flex items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                  <Check className="size-3.5 stroke-[2.5]" />
                </span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mx-auto w-full max-w-[280px] pb-8 md:max-w-[320px]">
          <Phone>
            <Screen src={S("01-request-inbox.jpg")} alt={t.alt.s01} {...PHONE} eager />
          </Phone>
          <div className="absolute -bottom-2 -left-10 w-[210px] rotate-[-6deg] overflow-hidden rounded-[18px] shadow-phone transition-transform hover:rotate-0 duration-300 sm:-left-24 sm:w-[260px]">
            <Screen src={S("06-tanga-wallet.jpg")} alt={t.alt.s06} w={716} h={434} eager />
          </div>
          <div className="float-slow absolute -right-3 top-16 z-20 flex items-center gap-2.5 rounded-2xl border border-border/80 bg-card/95 px-3.5 py-2.5 text-xs font-semibold shadow-soft backdrop-blur-sm sm:-right-12">
            <span className="size-2.5 shrink-0 rounded-full bg-emerald-500 shadow-xs" />
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-provider-soft text-provider">
              <Inbox className="size-3.5" />
            </span>
            <span className="truncate max-w-[190px]">{t.hero.chip}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Dedicated Mobile Hero (compact, punchy, app-first) */
function HeroMobile({ t }: { t: Copy }) {
  return (
    <section className="relative overflow-hidden px-4 pt-6 pb-10 md:hidden">
      <div className="pointer-events-none absolute -right-20 -top-20 size-[300px] rounded-full bg-brand opacity-15 blur-3xl" />

      {/* Live Badge */}
      <div className="inline-flex items-center gap-2 rounded-full border border-provider/25 bg-provider-soft px-3 py-1 text-xs font-bold text-provider shadow-xs">
        <span className="size-2 rounded-full bg-provider shadow-xs" />
        <MapPin className="size-3" />
        <span>{t.hero.pill}</span>
      </div>

      {/* Main Title */}
      <h1 className="mt-4 text-3xl font-extrabold leading-[1.1] tracking-tight">
        <span className="text-brand">{t.hero.h1}</span>
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.hero.sub}</p>

      {/* Trust Pills Bar */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {t.hero.checks.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-xs"
          >
            <Check className="size-3 text-success stroke-[2.5]" />
            {c}
          </span>
        ))}
      </div>

      {/* CTAs */}
      <div className="mt-6 flex flex-col gap-2.5">
        <a href={REGISTER} className={cn(btn.primary, "w-full py-3.5 text-base justify-center shadow-md")}>
          <span>{t.hero.register}</span>
          <ArrowRight className="size-4" />
        </a>
        <a
          href={TG}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(btn.secondary, "w-full py-3 text-sm justify-center")}
        >
          <TgIcon className="size-4 text-telegram" />
          <span>{t.hero.telegram}</span>
        </a>
      </div>

      {/* Mobile App Screen Teaser Card */}
      <div className="relative mx-auto mt-8 w-full max-w-[270px]">
        <Phone className="rounded-[32px] p-[5px]">
          <Screen src={S("01-request-inbox.jpg")} alt={t.alt.s01} {...PHONE} eager />
        </Phone>
        {/* Floating Live Order Chip */}
        <div className="float-slow absolute -bottom-3 -right-2 z-20 flex max-w-[240px] items-center gap-2 rounded-2xl border border-border/80 bg-card/95 px-3 py-2 text-xs font-semibold shadow-soft backdrop-blur-sm">
          <span className="size-2 shrink-0 rounded-full bg-emerald-500 shadow-xs" />
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-provider-soft text-provider">
            <Inbox className="size-3.5" />
          </span>
          <span className="truncate">{t.hero.chip}</span>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   2. WHAT IS HORMANG
   ========================================================================= */

/** Desktop What Section */
function WhatDesktop({ t }: { t: Copy }) {
  const icons = [FileText, Send, MousePointerClick];
  return (
    <section className="hidden md:block bg-surface py-16 lg:py-24 border-y border-border/40">
      <div className="mx-auto max-w-6xl px-4">
        <H2 className="text-center">{t.what.title}</H2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {t.what.cards.map(([h, p], i) => {
            const I = icons[i]!;
            return (
              <div
                key={h}
                className="reveal rounded-3xl border border-border bg-card p-7 shadow-soft transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-md"
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <span
                  className={cn(
                    "grid size-12 place-items-center rounded-2xl shadow-xs",
                    i === 1 ? "bg-provider-soft text-provider" : "bg-secondary text-primary",
                  )}
                >
                  <I className="size-6" />
                </span>
                <h3 className="mt-5 text-xl font-bold tracking-tight">{h}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{p}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Mobile What Section (compact 3-step connected timeline) */
function WhatMobile({ t }: { t: Copy }) {
  const icons = [FileText, Send, MousePointerClick];
  return (
    <section className="bg-surface py-10 md:hidden border-y border-border/40">
      <div className="px-4">
        <H2 className="text-center text-2xl font-extrabold">{t.what.title}</H2>
        <div className="mt-6 space-y-3">
          {t.what.cards.map(([h, p], i) => {
            const I = icons[i]!;
            return (
              <div key={h} className="flex gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-soft">
                <span className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-xl",
                  i === 1 ? "bg-provider-soft text-provider" : "bg-secondary text-primary",
                )}>
                  <I className="size-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{h}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   3. HOW IT WORKS (Sticky Scroll on Desktop vs Interactive Stepper on Mobile)
   ========================================================================= */

function StepVisual({ t, i }: { t: Copy; i: number }) {
  if (i === 0)
    return (
      <div className="relative mx-auto w-full max-w-[400px] pb-4">
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-phone">
          <Screen src={S("09-service-area.jpg")} alt={t.alt.s09} w={480} h={253} />
        </div>
        <figure className="ml-auto mt-[-20px] w-[160px] text-center sm:mr-4">
          <Phone className="rounded-[26px] p-[5px] shadow-lg">
            <Screen src={S("10-customer-questionnaire.jpg")} alt={t.alt.s10} w={370} h={696} />
          </Phone>
          <figcaption className="mt-2 text-xs font-medium text-muted-foreground">{t.how.caption}</figcaption>
        </figure>
      </div>
    );
  if (i === 3)
    return (
      <div className="relative mx-auto w-full max-w-[380px]">
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-phone">
          <Screen src={S("03-customer-sees-offer.jpg")} alt={t.alt.s03} w={780} h={644} />
        </div>
      </div>
    );
  const files = ["", "01-request-inbox.jpg", "02-offer-form.jpg", "", "05-reviews.jpg"];
  const alts = ["", t.alt.s01, t.alt.s02, "", t.alt.s05];
  return (
    <Phone className="mx-auto w-full max-w-[290px]">
      <Screen src={S(files[i]!)} alt={alts[i]!} {...PHONE} />
    </Phone>
  );
}

/** Desktop How It Works with Sticky Phone */
function HowDesktop({ t }: { t: Copy }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset["i"]));
        }),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((r) => r && io.observe(r));
    return () => io.disconnect();
  }, []);

  return (
    <section id="qanday" className="scroll-mt-16 py-16 lg:py-24 hidden md:block">
      <div className="mx-auto max-w-6xl px-4">
        <H2 className="text-center">{t.how.title}</H2>
        <div className="mt-12 grid gap-10 md:grid-cols-2">
          <div>
            {t.how.steps.map(([h, p], i) => (
              <div
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                data-i={i}
                className={cn(
                  "py-8 transition-opacity duration-500 md:flex md:min-h-[75vh] md:flex-col md:justify-center",
                  active === i ? "md:opacity-100" : "md:opacity-35",
                )}
              >
                <span className="text-7xl font-extrabold leading-none text-provider/20 md:text-8xl select-none font-mono">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 text-2xl font-bold md:text-3xl tracking-tight">{h}</h3>
                <p className="mt-3 max-w-md text-lg leading-relaxed text-muted-foreground">{p}</p>
              </div>
            ))}
          </div>
          <div className="block">
            <div className="sticky top-24 grid h-[calc(100vh-8rem)] place-items-center">
              <div className="relative grid w-full place-items-center">
                {t.how.steps.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "col-start-1 row-start-1 w-full transition-[transform,opacity] duration-700",
                      active === i
                        ? "scale-100 opacity-100"
                        : "pointer-events-none scale-95 opacity-0",
                    )}
                    aria-hidden={active !== i}
                  >
                    <StepVisual t={t} i={i} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Dedicated Mobile How It Works: Interactive Swipeable Walkthrough Card with Slide Animation */
function HowMobile({ t }: { t: Copy }) {
  const [active, setActive] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const steps = t.how.steps;
  const shortSteps = t.how.shortSteps;
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const handleStart = (clientX: number, clientY: number) => {
    touchStart.current = { x: clientX, y: clientY };
    isHorizontalSwipe.current = null;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!touchStart.current) return;
    const diffX = clientX - touchStart.current.x;
    const diffY = clientY - touchStart.current.y;

    if (isHorizontalSwipe.current === null) {
      if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 8) {
        isHorizontalSwipe.current = false;
      } else if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
        isHorizontalSwipe.current = true;
      }
    }

    if (isHorizontalSwipe.current) {
      let offset = diffX;
      if ((active === 0 && diffX > 0) || (active === steps.length - 1 && diffX < 0)) {
        offset = diffX * 0.25;
      }
      setDragOffset(offset);
    }
  };

  const handleEnd = () => {
    if (isHorizontalSwipe.current && Math.abs(dragOffset) > 40) {
      if (dragOffset < 0) {
        setActive((p) => Math.min(steps.length - 1, p + 1));
      } else {
        setActive((p) => Math.max(0, p - 1));
      }
    }
    setIsDragging(false);
    setDragOffset(0);
    touchStart.current = null;
    isHorizontalSwipe.current = null;
  };

  return (
    <section id="qanday-m" className="scroll-mt-14 py-10 md:hidden">
      <div className="px-4">
        <p className="text-center text-xs font-semibold text-primary">5 ta tezkor qadam</p>
        <H2 className="mt-1 text-center text-2xl font-extrabold">{t.how.title}</H2>

        {/* Horizontal Step Tabs */}
        <div className="no-scrollbar mt-5 flex gap-1.5 overflow-x-auto pb-1">
          {shortSteps.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition-[transform,background-color] active:scale-95 cursor-pointer",
                active === i
                  ? "bg-brand text-primary-foreground shadow-brand"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-4 place-items-center rounded-full text-[10px] font-bold",
                  active === i ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              <span>{name}</span>
            </button>
          ))}
        </div>

        {/* Step Card with Interactive Slide Animation */}
        <div
          onTouchStart={(e) => {
            const touch = e.touches[0];
            if (touch) handleStart(touch.clientX, touch.clientY);
          }}
          onTouchMove={(e) => {
            const touch = e.touches[0];
            if (touch) handleMove(touch.clientX, touch.clientY);
          }}
          onTouchEnd={handleEnd}
          onTouchCancel={handleEnd}
          onMouseDown={(e) => {
            if (e.button === 0) handleStart(e.clientX, e.clientY);
          }}
          onMouseMove={(e) => {
            if (isDragging) handleMove(e.clientX, e.clientY);
          }}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          className="mt-4 select-none rounded-3xl border border-border bg-card p-5 shadow-soft touch-pan-y overflow-hidden cursor-grab active:cursor-grabbing"
        >
          {/* Card Header: Step counter and progress dots */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-mono font-bold text-provider">QADAM {String(active + 1).padStart(2, "0")} / 05</span>
            <div className="flex gap-1.5 items-center">
              {steps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Qadam ${i + 1}`}
                  className={cn(
                    "h-1.5 rounded-full transition-colors duration-200 cursor-pointer",
                    active === i ? "w-5 bg-brand" : "w-1.5 bg-border hover:bg-muted-foreground/40",
                  )}
                />
              ))}
            </div>
          </div>

          {/* Carousel Slide Track */}
          <div className="mt-3 overflow-hidden">
            <div
              className="flex will-change-transform"
              style={{
                transform: `translateX(calc(-${active * 100}% + ${dragOffset}px))`,
                transition: isDragging
                  ? "none"
                  : "transform 320ms cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            >
              {steps.map(([h, p], i) => (
                <div key={i} className="w-full shrink-0 px-0.5">
                  <h3 className="text-lg font-bold tracking-tight">{h}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground min-h-[34px]">{p}</p>

                  {/* Phone Screen Mockup inside Stepper */}
                  <div className="mt-4 overflow-hidden rounded-2xl border border-border/80 bg-surface p-2">
                    <div className="max-w-[240px] mx-auto min-h-[380px] flex items-center justify-center">
                      <StepVisual t={t} i={i} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Swipe indicator */}
          <div className="mt-3 flex items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground/60">
            <ChevronLeft className="size-3" />
            <span>Suring</span>
            <ChevronRight className="size-3" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   4. TANGA & EARNINGS CALCULATOR
   ========================================================================= */

/** Desktop Tanga Section */
function TangaDesktop({ t }: { t: Copy }) {
  const [price, setPrice] = useState(500000);
  const icons = [Percent, CalendarX, Eye, Gift];
  const presets = [250000, 500000, 1000000, 2500000, 5000000];
  const pct = Math.round(((price - 100000) / (5000000 - 100000)) * 100);

  return (
    <section id="tanga" className="scroll-mt-16 bg-surface py-16 lg:py-24 border-y border-border/40 hidden md:block">
      <div className="mx-auto grid max-w-6xl items-start gap-12 px-4 md:grid-cols-2">
        <div className="reveal relative mx-auto w-full max-w-md md:sticky md:top-24">
          <div className="float-slow mx-auto size-48 overflow-hidden rounded-full shadow-phone ring-8 ring-tanga-soft md:size-64 shadow-amber-500/25">
            <Screen src={S("tanga-coin.jpg")} alt={t.alt.coin} w={1} h={1} className="scale-[1.2] rounded-full" />
          </div>
          <div className="mx-auto mt-8 max-w-sm overflow-hidden rounded-[26px] shadow-phone">
            <Screen src={S("06-tanga-wallet.jpg")} alt={t.alt.s06} w={716} h={434} />
          </div>
        </div>
        <div className="min-w-0">
          <p className="reveal text-sm font-semibold text-tanga">{t.tanga.eyebrow}</p>
          <H2 className="mt-2">{t.tanga.h2}</H2>
          <p className="reveal mt-4 text-lg leading-relaxed text-muted-foreground">{t.tanga.text}</p>
          <ul className="mt-8 space-y-5">
            {t.tanga.rows.map(([h, p], i) => {
              const I = icons[i]!;
              return (
                <li key={h} className="reveal flex gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-tanga-soft text-tanga shadow-xs">
                    <I className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-base">{h}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{p}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Interactive Calculator */}
          <div className="reveal mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold text-lg">
                <Coins className="size-5 text-tanga" /> {t.tanga.calc}
              </h3>
              <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-bold text-success">
                0% komissiya
              </span>
            </div>

            <label className="mt-5 block text-xs font-semibold text-muted-foreground" htmlFor="calc">
              {t.tanga.price}
            </label>
            <div className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight text-foreground">
              {formatSum(price)} <span className="text-xl font-bold text-muted-foreground">{t.tanga.currency}</span>
            </div>

            <input
              id="calc"
              type="range"
              min={100000}
              max={5000000}
              step={50000}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="calc mt-4 w-full"
              style={{
                background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${pct}%, var(--slider-track) ${pct}%, var(--slider-track) 100%)`,
              }}
            />

            {/* Quick preset chips */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrice(p)}
                  className={cn(
                    "rounded-xl px-2.5 py-1 text-xs font-semibold transition-[transform,background-color] active:scale-95 cursor-pointer",
                    price === p
                      ? "bg-provider text-white shadow-xs"
                      : "bg-surface text-muted-foreground hover:bg-border/60 hover:text-foreground",
                  )}
                >
                  {formatSum(p)}
                </button>
              ))}
            </div>

            {/* Earnings comparison cards */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-success/30 bg-success/10 p-4">
                <div className="text-xs font-semibold text-success">{t.tanga.youGet}</div>
                <div className="mt-1 text-2xl font-extrabold tabular-nums text-success">
                  {formatSum(price)} <span className="text-sm font-semibold">{t.tanga.currency}</span>
                </div>
                <div className="mt-1 text-xs font-medium text-success/80">100% sizga qoladi</div>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="text-xs font-semibold text-muted-foreground">{t.tanga.commission}</div>
                <div className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">
                  0 <span className="text-sm font-semibold text-muted-foreground">{t.tanga.currency}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Oylik obuna to'lovi yo'q</div>
              </div>
            </div>

            {/* Savings highlight banner */}
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-foreground flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 shrink-0 text-amber-500" />
                <span>
                  {t.tanga.otherCut}: <strong className="line-through text-destructive font-semibold">~{formatSum(price * 0.15)} {t.tanga.currency}</strong>
                </span>
              </div>
              <span className="font-bold text-success">
                +{formatSum(price * 0.15)} {t.tanga.currency} {t.tanga.savings}
              </span>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">{t.tanga.note}</p>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{t.tanga.pay}</p>
        </div>
      </div>
    </section>
  );
}

/** Dedicated Mobile Tanga: Fintech Profit Card */
function TangaMobile({ t }: { t: Copy }) {
  const [price, setPrice] = useState(500000);
  const presets = [200000, 500000, 1000000, 2500000, 5000000];
  const pct = Math.round(((price - 100000) / (5000000 - 100000)) * 100);
  const [showDetails, setShowDetails] = useState(false);
  const icons = [Percent, CalendarX, Eye, Gift];

  return (
    <section id="tanga-m" className="scroll-mt-14 bg-surface py-10 md:hidden border-y border-border/40">
      <div className="px-4">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-500 shadow-md">
            <Coins className="size-7 text-white" />
          </div>
          <p className="mt-3 text-xs font-semibold text-tanga">{t.tanga.eyebrow}</p>
          <H2 className="mt-1 text-2xl font-extrabold">{t.tanga.h2}</H2>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{t.tanga.text}</p>
        </div>

        {/* Fintech Earnings Card */}
        <div className="mt-5 rounded-3xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{t.tanga.price}</span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">
              0% komissiya
            </span>
          </div>

          <div className="mt-2 text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
            {formatSum(price)} <span className="text-base font-bold text-muted-foreground">{t.tanga.currency}</span>
          </div>

          {/* Range Slider */}
          <input
            id="calc-mobile"
            type="range"
            min={100000}
            max={5000000}
            step={50000}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="calc mt-4 w-full"
            style={{
              background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${pct}%, var(--slider-track) ${pct}%, var(--slider-track) 100%)`,
            }}
          />

          {/* Quick Presets Chips */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrice(p)}
                className={cn(
                  "rounded-xl px-2.5 py-1 text-xs font-semibold transition-[transform,background-color] active:scale-95 cursor-pointer",
                  price === p
                    ? "bg-provider text-white shadow-xs"
                    : "bg-surface text-muted-foreground hover:bg-border/60 hover:text-foreground",
                )}
              >
                {formatSum(p)}
              </button>
            ))}
          </div>

          {/* Profit Split Result */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-success/30 bg-success/10 p-3">
              <div className="text-xs font-semibold text-success">{t.tanga.youGet}</div>
              <div className="mt-0.5 text-lg font-extrabold tabular-nums text-success">
                {formatSum(price)}
              </div>
              <div className="text-[10px] text-success/80">100% sizga</div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-3">
              <div className="text-xs font-semibold text-muted-foreground">{t.tanga.commission}</div>
              <div className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">
                0 {t.tanga.currency}
              </div>
              <div className="text-[10px] text-muted-foreground">0% komissiya</div>
            </div>
          </div>

          {/* Savings Highlight */}
          <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-foreground">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 shrink-0 text-amber-500" />
              <span className="font-semibold">{t.tanga.savings}:</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-[11px] text-muted-foreground line-through">
                Boshqa joyda: -{formatSum(price * 0.15)} {t.tanga.currency}
              </span>
              <span className="font-extrabold text-success">
                +{formatSum(price * 0.15)} {t.tanga.currency}
              </span>
            </div>
          </div>
        </div>

        {/* Collapsible Tanga Facts */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-xs font-bold text-foreground transition active:scale-98 shadow-xs cursor-pointer"
          >
            <span>Tanga haqida 4 ta fakt</span>
            <ChevronDown className={cn("size-4 transition-transform", showDetails && "rotate-180")} />
          </button>
          {showDetails && (
            <ul className="mt-2 space-y-2 rounded-2xl border border-border bg-card p-4 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150">
              {t.tanga.rows.map(([h, p], i) => {
                const I = icons[i]!;
                return (
                  <li key={h} className="flex gap-2.5 text-xs">
                    <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-tanga-soft text-tanga">
                      <I className="size-3.5" />
                    </span>
                    <div>
                      <strong className="font-bold text-foreground">{h}: </strong>
                      <span className="text-muted-foreground">{p}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   5. PROFILE & TRUST SHOWCASE
   ========================================================================= */

/** Desktop Profile Showcase */
function ProfileDesktop({ t }: { t: Copy }) {
  const icons = [FileText, Star, BadgeCheck, Gift];
  return (
    <section id="profil" className="scroll-mt-16 overflow-hidden py-16 lg:py-24 hidden md:block">
      <div className="mx-auto max-w-6xl px-4">
        <H2 className="text-center">{t.profile.title}</H2>
        <div className="no-scrollbar -mx-4 mt-12 flex snap-x snap-mandatory items-center gap-5 overflow-x-auto px-4 pb-6 md:mx-0 md:justify-center md:gap-0 md:overflow-visible">
          <div className="w-[240px] shrink-0 snap-center transition-transform duration-300 md:z-0 md:-mr-6 md:translate-y-8 md:-rotate-6 hover:rotate-0 hover:z-20">
            <Phone>
              <Screen src={S("04-public-profile-portfolio.jpg")} alt={t.alt.s04} {...PHONE} />
            </Phone>
          </div>
          <div className="w-[260px] shrink-0 snap-center transition-transform duration-300 md:z-10 md:w-[300px] hover:scale-[1.02] hover:z-20">
            <Phone>
              <Screen src={S("07-provider-home.jpg")} alt={t.alt.s07} {...PHONE} />
            </Phone>
          </div>
          <div className="w-[280px] shrink-0 snap-center transition-transform duration-300 md:z-0 md:-ml-6 md:translate-y-8 md:rotate-6 md:w-[320px] hover:rotate-0 hover:z-20">
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-phone">
              <Screen src={S("08-badges.jpg")} alt={t.alt.s08} w={512} h={539} />
            </div>
          </div>
        </div>

        <ul className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
          {t.profile.bullets.map((b, i) => {
            const I = icons[i]!;
            return (
              <li
                key={b}
                className="reveal flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-provider-soft text-provider shadow-xs">
                  <I className="size-4" />
                </span>
                <span className="pt-1.5 font-medium text-sm md:text-base">{b}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Dedicated Mobile Profile Showcase: Segmented Switcher & 2x2 Feature Grid */
function ProfileMobile({ t }: { t: Copy }) {
  const [tab, setTab] = useState(0);
  const tabs = t.profile.tabs;
  const icons = [FileText, Star, BadgeCheck, Gift];

  const screens = [
    { src: S("04-public-profile-portfolio.jpg"), alt: t.alt.s04, w: 780, h: 1688 },
    { src: S("07-provider-home.jpg"), alt: t.alt.s07, w: 780, h: 1688 },
    { src: S("08-badges.jpg"), alt: t.alt.s08, w: 512, h: 539 },
  ];

  return (
    <section id="profil-m" className="scroll-mt-14 py-10 md:hidden">
      <div className="px-4">
        <H2 className="text-center text-2xl font-extrabold">{t.profile.title}</H2>

        {/* 3 Tabs */}
        <div className="mt-5 flex rounded-2xl border border-border bg-muted/60 p-1">
          {tabs.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => setTab(i)}
              className={cn(
                "flex-1 rounded-xl py-2 text-xs font-bold transition active:scale-95 cursor-pointer text-center",
                tab === i
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {name}
            </button>
          ))}
        </div>

        {/* Active Phone Preview */}
        <div className="mx-auto mt-5 max-w-[250px]">
          {tab === 2 && screens[2] ? (
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-phone">
              <Screen src={screens[2].src} alt={screens[2].alt} w={screens[2].w} h={screens[2].h} />
            </div>
          ) : screens[tab] ? (
            <Phone className="rounded-[32px] p-[5px]">
              <Screen src={screens[tab].src} alt={screens[tab].alt} w={screens[tab].w} h={screens[tab].h} />
            </Phone>
          ) : null}
        </div>

        {/* 4 Feature Badges in 2x2 Grid */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          {t.profile.bullets.map((b, i) => {
            const I = icons[i]!;
            return (
              <div key={b} className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-3 shadow-soft">
                <span className="grid size-7 place-items-center rounded-xl bg-provider-soft text-provider">
                  <I className="size-3.5" />
                </span>
                <span className="text-xs font-semibold leading-snug">{b}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   6. WHY HORMANG (Table on Desktop vs Versus Cards on Mobile)
   ========================================================================= */

/** Desktop Why Hormang Table */
function WhyDesktop({ t }: { t: Copy }) {
  return (
    <section className="bg-surface py-16 lg:py-24 border-y border-border/40 hidden md:block">
      <div className="mx-auto max-w-4xl px-4">
        <H2 className="text-center">{t.why.title}</H2>
        <div className="reveal mt-10 overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
          <div className="grid grid-cols-2 border-b border-border text-sm font-bold">
            <div className="flex items-center gap-2 p-4 text-muted-foreground md:p-5 bg-muted/30">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                OLX / Telegram
              </span>
              <span>{t.why.old}</span>
            </div>
            <div className="flex items-center gap-2 bg-secondary/80 p-4 text-primary md:p-5">
              <span className="rounded-md bg-brand text-primary-foreground px-2 py-0.5 text-xs font-semibold shadow-xs">
                Hormang
              </span>
              <span>{t.why.neu}</span>
            </div>
          </div>
          {t.why.rows.map(([a, b]) => (
            <div
              key={a}
              className="grid grid-cols-2 border-b border-border last:border-0 transition-colors hover:bg-muted/15"
            >
              <div className="flex min-w-0 gap-2 p-4 text-sm text-muted-foreground md:p-5 md:text-base">
                <X className="mt-0.5 size-4 shrink-0 text-destructive stroke-[2.5]" />
                <span>{a}</span>
              </div>
              <div className="flex min-w-0 gap-2 bg-secondary/30 p-4 text-sm font-semibold md:p-5 md:text-base">
                <Check className="mt-0.5 size-4 shrink-0 text-success stroke-[2.5]" />
                <span className="text-foreground">{b}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Dedicated Mobile Versus Cards */
function WhyMobile({ t }: { t: Copy }) {
  return (
    <section className="bg-surface py-10 md:hidden border-y border-border/40">
      <div className="px-4">
        <H2 className="text-center text-2xl font-extrabold">{t.why.title}</H2>

        <div className="mt-5 space-y-3">
          {t.why.rows.map(([oldWay, newWay], i) => (
            <div key={i} className="rounded-3xl border border-border bg-card p-4 shadow-soft">
              {/* Old way */}
              <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
                  <X className="size-3 stroke-[3]" />
                </span>
                <div>
                  <span className="font-semibold text-destructive/90">Eski usul (OLX/TG): </span>
                  <span>{oldWay}</span>
                </div>
              </div>

              <div className="my-2.5 border-t border-border/60" />

              {/* Hormang way */}
              <div className="flex items-start gap-2.5 text-xs font-semibold text-foreground">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                  <Check className="size-3 stroke-[3]" />
                </span>
                <div>
                  <span className="font-bold text-success">Hormang bilan: </span>
                  <span>{newWay}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   7. START IN 5 MINUTES
   ========================================================================= */

/** Desktop Start Steps Grid */
function StartDesktop({ t }: { t: Copy }) {
  return (
    <section className="py-16 lg:py-24 hidden md:block">
      <div className="mx-auto max-w-6xl px-4">
        <H2 className="text-center">{t.start.title}</H2>
        <ol className="mt-10 grid gap-4 md:grid-cols-5">
          {t.start.steps.map((s, i) => (
            <li
              key={s}
              className="reveal flex items-center gap-4 rounded-3xl border border-border bg-card p-5 shadow-soft transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-md md:flex-col md:items-start"
              style={{ transitionDelay: `${i * 70}ms` }}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand font-bold text-primary-foreground shadow-brand text-sm">
                {i + 1}
              </span>
              <span className="font-semibold text-sm leading-snug">{s}</span>
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <Cta t={t} label={t.start.cta} />
        </div>
      </div>
    </section>
  );
}

/** Dedicated Mobile Connected Checklist */
function StartMobile({ t }: { t: Copy }) {
  return (
    <section className="py-10 md:hidden">
      <div className="px-4">
        <H2 className="text-center text-2xl font-extrabold">{t.start.title}</H2>

        <ol className="relative mt-6 space-y-4 pl-4 border-l-2 border-brand/25 ml-4">
          {t.start.steps.map((s, i) => (
            <li key={s} className="relative pl-5">
              <span className="absolute -left-[25px] top-0 grid size-6 place-items-center rounded-full bg-brand text-xs font-bold text-white shadow-xs">
                {i + 1}
              </span>
              <p className="text-xs font-semibold leading-snug">{s}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 text-center">
          <Cta t={t} label={t.start.cta} className="w-full justify-center" />
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   8. FAQ & FINAL & FOOTER
   ========================================================================= */

function Faq({ t }: { t: Copy }) {
  return (
    <section id="savollar" className="scroll-mt-16 bg-surface py-12 lg:py-24 border-y border-border/40">
      <div className="mx-auto max-w-3xl px-4">
        <H2 className="text-center text-2xl md:text-4xl">{t.faq.title}</H2>
        <div className="mt-8 space-y-3">
          {t.faq.items.map(([q, a]) => (
            <details
              key={q}
              className="reveal group rounded-2xl border border-border bg-card px-5 shadow-soft transition-colors duration-200 open:border-primary/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-sm md:text-base transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
                <span>{q}</span>
                <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 group-open:text-primary" />
              </summary>
              <p className="pb-5 leading-relaxed text-muted-foreground text-xs md:text-base border-t border-border/40 pt-3">
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Final({ t }: { t: Copy }) {
  return (
    <section className="px-4 py-12 lg:py-24">
      <div className="reveal mx-auto max-w-5xl rounded-[32px] bg-brand px-6 py-12 text-center text-primary-foreground shadow-brand md:py-20">
        <h2 className="text-2xl font-extrabold tracking-tight md:text-5xl">{t.final.h2}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm md:text-lg opacity-90 leading-relaxed">{t.final.sub}</p>
        <div className="mt-6 md:mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Cta t={t} variant="light" />
          <TgBtn t={t} variant="ghost" />
        </div>
      </div>
    </section>
  );
}

function Footer({ t }: { t: Copy }) {
  return (
    <footer className="border-t border-border py-10 md:py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 font-extrabold">
            <img src={S("hormang-logo.png")} alt="" width={28} height={28} className="size-7 rounded-lg" loading="lazy" />
            <span className="text-base tracking-tight">Hormang</span>
          </div>
          <p className="mt-1 text-xs md:text-sm text-muted-foreground">{t.footer.desc}</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs md:text-sm font-medium text-muted-foreground">
          <a href={MAIN} className="transition hover:text-primary">{t.footer.customers}</a>
          <a href={TG} target="_blank" rel="noopener noreferrer" className="transition hover:text-primary">{t.footer.bot}</a>
          <a href={LOGIN} className="transition hover:text-primary">{t.footer.login}</a>
          <a href="mailto:support@hormang.co.uz" className="transition hover:text-primary">support@hormang.co.uz</a>
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-6xl px-4 text-xs text-muted-foreground">© 2026 Hormang. "UMR KO" MCHJ</p>
    </footer>
  );
}
