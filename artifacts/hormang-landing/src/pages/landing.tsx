import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import {
  BadgeCheck, ShieldCheck, CreditCard, CheckCircle2, ClipboardList,
  Search, MessageSquare, ArrowRight, Coins, Wallet, Gift,
  Users, Sparkles, Zap,
} from "lucide-react";
import { useI18n } from "@/contexts/i18n-context";

const EASE = [0.16, 1, 0.3, 1] as const;

function RotatingWord({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % words.length), 2200);
    return () => clearInterval(id);
  }, [words.length]);
  return (
    <span className="relative inline-block align-bottom">
      <AnimatePresence mode="wait">
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="inline-block text-blue-600 font-extrabold"
        >
          {words[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function PhoneFrame({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`relative rounded-[2rem] border-[5px] border-gray-900 bg-gray-900 shadow-2xl shadow-blue-900/20 overflow-hidden ${className}`}>
      <img src={src} alt={alt} loading="lazy" className="block w-full" />
    </div>
  );
}

function CardFrame({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`relative rounded-2xl border border-gray-200/70 bg-white shadow-xl shadow-blue-900/10 overflow-hidden ${className}`}>
      <img src={src} alt={alt} loading="lazy" className="block w-full" />
    </div>
  );
}

function HeroSection() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const trust = [
    { icon: ShieldCheck, label: t.landing.hero.trust.verified },
    { icon: CreditCard, label: t.landing.hero.trust.noHidden },
    { icon: Wallet, label: t.landing.hero.trust.payAfter },
  ];

  return (
    <section className="relative overflow-hidden bg-white pt-28 pb-16 md:pt-36 md:pb-24 lg:pt-40 lg:pb-28">
      {/* Background with silk waves matching mockup */}
      <div
        className="absolute inset-0 bg-cover bg-center sm:bg-[center_top] pointer-events-none opacity-95"
        style={{ backgroundImage: "url('/images/hero-bg.png')" }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-6 items-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
            className="lg:col-span-5 xl:col-span-5 text-center lg:text-left z-10"
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50/80 border border-blue-200/70 text-blue-600 text-[11px] sm:text-xs font-bold tracking-wide uppercase shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-blue-500 fill-blue-500/20" />
              <span>{t.landing.hero.badge}</span>
            </div>

            <h1 className="mt-6 font-display text-3xl sm:text-4xl md:text-5xl lg:text-[3.4rem] font-extrabold leading-[1.12] tracking-tight text-gray-900">
              <span className="block">{t.landing.hero.headlineLine1}</span>
              <span className="block text-blue-600">
                <RotatingWord words={t.landing.rotateWords} />
              </span>
              <span className="block">{t.landing.hero.headlineLine3}</span>
            </h1>

            <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
              {t.landing.hero.subtext}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3.5 justify-center lg:justify-start items-stretch sm:items-center">
              <Button
                size="lg"
                className="h-12 sm:h-13 px-7 rounded-2xl font-bold text-sm sm:text-base gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all"
                onClick={() => setLocation("/questionnaire")}
              >
                {t.landing.hero.startSurvey}
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 sm:h-13 px-7 rounded-2xl font-bold text-sm sm:text-base border border-gray-200 bg-white/90 hover:bg-white text-gray-800 shadow-sm hover:border-gray-300 active:scale-[0.98] transition-all"
                onClick={() => setLocation("/auth/role")}
              >
                {t.landing.hero.becomeProvider}
              </Button>
            </div>

            <div className="mt-8 sm:mt-10 pt-2 grid grid-cols-3 gap-2 sm:gap-4 lg:flex lg:flex-row lg:flex-nowrap lg:gap-5 xl:gap-7 justify-center lg:justify-start max-w-md sm:max-w-lg lg:max-w-none mx-auto lg:mx-0">
              {trust.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2.5 lg:gap-3 text-center sm:text-left shrink-0"
                >
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-50/90 border border-blue-100 flex items-center justify-center text-blue-600 shadow-xs shrink-0">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <span className="text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 leading-tight max-w-[115px]">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
            className="lg:col-span-7 xl:col-span-7 relative flex items-center justify-center lg:justify-end mt-8 lg:mt-0"
          >
            <div className="relative w-full max-w-[360px] sm:max-w-[520px] lg:max-w-[660px] xl:max-w-[740px] lg:ml-auto lg:mr-0 lg:translate-x-10 xl:translate-x-16 2xl:translate-x-24 lg:scale-110 xl:scale-[1.15] lg:origin-center">
              <img
                src="/images/hero.png"
                alt={t.landing.hero.surveyAlt}
                className="w-full h-auto object-contain select-none pointer-events-none drop-shadow-2xl mx-auto lg:ml-auto lg:mr-0"
                loading="eager"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const { t } = useI18n();
  const ICONS = [ClipboardList, Search, MessageSquare, CreditCard];
  const NUMS = ["01", "02", "03", "04"];

  return (
    <section id="how-it-works" className="py-24 md:py-28 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-center mb-14"
        >
          <span className="pill-label mb-5 inline-flex">{t.landing.howItWorks.pill}</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
            {t.landing.howItWorks.titleA}{" "}
            <span className="text-gradient">{t.landing.howItWorks.titleB}</span>
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 relative">
          <div className="hidden lg:block absolute top-11 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent pointer-events-none" />
          {t.landing.howItWorks.steps.map((step, i) => {
            const Icon = ICONS[i] ?? ClipboardList;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.7, ease: EASE }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="relative bg-white rounded-2xl p-6 border border-gray-100 card-shadow hover:card-shadow-hover hover:border-blue-100 transition-all duration-250"
              >
                <div aria-hidden className="absolute top-5 right-5 text-5xl font-extrabold text-gray-100 leading-none select-none">
                  {NUMS[i]}
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mb-5 shadow-sm relative z-10">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-base font-bold mb-2 text-gray-900">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CategoriesSection() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();

  return (
    <section id="categories" className="py-24 md:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-center mb-14"
        >
          <span className="pill-label mb-5 inline-flex">{t.landing.categories.pill}</span>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-3 text-gray-900">
            <span className="text-gradient">{t.landing.categories.titleA}</span> {t.landing.categories.titleB}
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto text-base leading-relaxed">
            {t.landing.categories.desc}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {t.landing.categories.list.map((cat, i) => (
            <motion.button
              key={cat.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 3) * 0.07, duration: 0.6, ease: EASE }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              onClick={() => setLocation(`/questionnaire?cat=${cat.id}`)}
              className="group text-left bg-white rounded-2xl border border-gray-100 p-5 card-shadow hover:card-shadow-hover hover:border-blue-100 transition-all duration-250 flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center text-2xl shrink-0 transition-colors duration-200">
                <span aria-hidden>{cat.emoji}</span>
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-gray-900">{cat.name}</h3>
                <p className="text-gray-500 text-sm leading-snug truncate">{cat.desc}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-blue-500 ml-auto opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 shrink-0" />
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShowcaseRow({
  tag, title, desc, bullets, media, reverse, delay = 0,
}: {
  tag: string; title: string; desc: string; bullets: string[];
  media: React.ReactNode; reverse?: boolean; delay?: number;
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
      <motion.div
        initial={{ opacity: 0, x: reverse ? 30 : -30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.8, ease: EASE, delay }}
        className={reverse ? "lg:order-2" : ""}
      >
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600 mb-4">
          {tag}
        </span>
        <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">{title}</h3>
        <p className="text-gray-500 text-base leading-relaxed mb-6">{desc}</p>
        <ul className="space-y-3">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-3">
              <CheckCircle2 className="w-[18px] h-[18px] shrink-0 mt-0.5 text-blue-500" />
              <span className="text-sm font-semibold text-gray-800 leading-relaxed">{b}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.85, ease: EASE, delay: delay + 0.1 }}
        className={`flex justify-center ${reverse ? "lg:order-1" : ""}`}
      >
        {media}
      </motion.div>
    </div>
  );
}

function ShowcaseSection() {
  const { t } = useI18n();
  const s = t.landing.showcase;

  return (
    <section className="py-24 md:py-28 bg-gray-50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-center mb-16 md:mb-20"
        >
          <span className="pill-label mb-5 inline-flex">{s.pill}</span>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-3 text-gray-900">{s.title}</h2>
          <p className="text-gray-500 max-w-xl mx-auto text-base leading-relaxed">{s.desc}</p>
        </motion.div>

        <div className="space-y-20 md:space-y-28">
          <ShowcaseRow
            tag={s.survey.tag}
            title={s.survey.title}
            desc={s.survey.desc}
            bullets={s.survey.bullets}
            media={<CardFrame src="/showcase/survey-question.jpg" alt={s.survey.title} className="w-full max-w-[380px]" />}
          />
          <ShowcaseRow
            reverse
            tag={s.profile.tag}
            title={s.profile.title}
            desc={s.profile.desc}
            bullets={s.profile.bullets}
            media={<PhoneFrame src="/showcase/ppp.jpg" alt={s.profile.title} className="w-[250px]" />}
          />
          <ShowcaseRow
            tag={s.reviews.tag}
            title={s.reviews.title}
            desc={s.reviews.desc}
            bullets={s.reviews.bullets}
            media={<PhoneFrame src="/showcase/reviews.jpg" alt={s.reviews.title} className="w-[250px]" />}
          />
          <ShowcaseRow
            reverse
            tag={s.badges.tag}
            title={s.badges.title}
            desc={s.badges.desc}
            bullets={s.badges.bullets}
            media={<CardFrame src="/showcase/badges.jpg" alt={s.badges.title} className="w-full max-w-[380px]" />}
          />
          <ShowcaseRow
            tag={s.review.tag}
            title={s.review.title}
            desc={s.review.desc}
            bullets={s.review.bullets}
            media={<CardFrame src="/showcase/review.jpg" alt={s.review.title} className="w-full max-w-[360px]" />}
          />
        </div>
      </div>
    </section>
  );
}

function BuyerBenefitsSection() {
  const { t } = useI18n();
  const ICONS = [ShieldCheck, ClipboardList, MessageSquare, CreditCard];

  return (
    <section className="py-24 md:py-28 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: EASE }}
          className="text-center mb-12"
        >
          <span className="pill-label mb-5 inline-flex">{t.landing.buyerBenefits.pill}</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
            {t.landing.buyerBenefits.title}
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {t.landing.buyerBenefits.features.map((feat, i) => {
            const Icon = ICONS[i] ?? ShieldCheck;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.08 + i * 0.09, duration: 0.6 }}
                className="bg-gray-50 border border-gray-100 rounded-xl p-5 hover:bg-blue-50/50 hover:border-blue-100 transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center mb-3.5 card-shadow">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <h4 className="text-sm font-bold mb-1.5 text-gray-900">{feat.title}</h4>
                <p className="text-gray-500 text-xs leading-relaxed">{feat.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ProviderSection() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();

  return (
    <section id="provider-benefits" className="py-24 md:py-28 bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: EASE }}
          className="text-center mb-12"
        >
          <span className="pill-label mb-5 inline-flex">{t.landing.provider.pill}</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
            {t.landing.provider.titleA}{" "}
            <span className="text-gradient">{t.landing.provider.titleB}</span>
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto mb-10">
          {t.landing.provider.benefits.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.08 + i * 0.08, duration: 0.6 }}
              className="flex items-start gap-3.5 bg-white border border-gray-100 rounded-xl p-5 card-shadow"
            >
              <div className="w-6 h-6 rounded-full bg-blue-600 shrink-0 flex items-center justify-center mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-gray-700 font-medium text-sm leading-relaxed">{item}</span>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <Button
            size="lg"
            className="h-12 px-7 rounded-xl font-semibold text-sm gap-2 bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-200"
            onClick={() => setLocation("/auth/role")}
          >
            {t.landing.provider.becomeProvider}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function TangaSection() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const ICONS = [Users, Coins, Wallet];

  return (
    <section id="pricing" className="py-24 md:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-center mb-14"
        >
          <span className="pill-label mb-5 inline-flex">{t.landing.tanga.pill}</span>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-3 text-gray-900">{t.landing.tanga.title}</h2>
          <p className="text-gray-500 max-w-xl mx-auto text-base leading-relaxed">{t.landing.tanga.desc}</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {t.landing.tanga.points.map((p, i) => {
            const Icon = ICONS[i] ?? Coins;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.7, ease: EASE }}
                className="bg-gray-50 rounded-2xl p-7 border border-gray-100 card-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mb-5 shadow-sm">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-gray-900">{p.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{p.desc}</p>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-10 flex flex-col items-center gap-5"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-600">
            <Gift className="w-[18px] h-[18px] text-blue-500" />
            {t.landing.tanga.note}
          </p>
          <Button
            size="lg"
            variant="outline"
            className="h-12 px-7 rounded-xl font-semibold text-sm gap-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 transition-all duration-200"
            onClick={() => setLocation("/plans")}
          >
            {t.landing.tanga.cta}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

function CTASection() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  return (
    <section className="py-24 md:py-28 bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease: EASE }}
          className="bg-gradient-to-br from-blue-600 to-sky-500 rounded-3xl p-12 md:p-16 text-center relative overflow-hidden shadow-xl shadow-blue-200"
        >
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)", backgroundSize: "28px 28px" }} />
          <div className="relative z-10">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-white/15 items-center justify-center mb-7">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4 text-white">
              {t.landing.cta.title}
            </h2>
            <p className="text-base text-blue-100 mb-9 max-w-lg mx-auto leading-relaxed">
              {t.landing.cta.desc}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setLocation("/questionnaire")}
                className="h-12 px-7 rounded-xl font-semibold text-sm bg-white text-blue-600 gap-2 inline-flex items-center justify-center shadow-sm hover:bg-blue-50 transition-colors"
              >
                <Users className="w-4 h-4" />
                {t.landing.cta.asCustomer}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setLocation("/auth/role")}
                className="h-12 px-7 rounded-xl font-semibold text-sm bg-white/15 hover:bg-white/25 text-white gap-2 inline-flex items-center justify-center border border-white/25 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                {t.landing.cta.becomeProvider}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <HowItWorksSection />
      <CategoriesSection />
      <ShowcaseSection />
      <BuyerBenefitsSection />
      <ProviderSection />
      <TangaSection />
      <CTASection />
      <Footer />
      <BottomNav />
    </div>
  );
}
