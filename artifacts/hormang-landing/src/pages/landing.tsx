import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, CreditCard, CheckCircle2, ClipboardList,
  Search, MessageSquare, ArrowRight, Coins, Wallet, Gift,
  Users, Sparkles, X, UserCheck, ListFilter, Award, Check,
  ChevronDown, ChevronLeft, ChevronRight, Star
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { getActiveCategories, getCategoryDisplayName } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { getLocalizedText } from "@/lib/localization";

const EASE = [0.16, 1, 0.3, 1] as const;

function RotatingWord({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % words.length), 2200);
    return () => clearInterval(id);
  }, [words.length]);

  return (
    <span className="relative inline-block align-bottom" aria-hidden="true">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="inline-block text-blue-600 font-extrabold"
        >
          {words[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function PhoneFrame({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-[2rem] border-[5px] border-gray-900 bg-gray-900 shadow-2xl shadow-blue-900/15 overflow-hidden ${className}`}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        width={320}
        height={650}
        className="block w-full object-cover"
      />
    </div>
  );
}

function CardFrame({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-2xl border border-gray-200/80 bg-white shadow-xl shadow-blue-900/10 overflow-hidden ${className}`}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        width={500}
        height={320}
        className="block w-full object-cover"
      />
    </div>
  );
}

function HeroSection() {
  const { t, locale } = useI18n();
  const { user } = useAuth();

  const trust = [
    { icon: ShieldCheck, label: t.landing.hero.trust.verified },
    { icon: CreditCard, label: t.landing.hero.trust.noHidden },
    { icon: Wallet, label: t.landing.hero.trust.payAfter },
  ];

  const roleCopy = {
    uz: {
      providerPrimary: "Mening kabinetim",
      providerSecondary: "Buyurtmalar lentasi",
      buyerPrimary: "Yangi so'rov yaratish",
      buyerSecondary: "Mening so'rovlarim",
    },
    ru: {
      providerPrimary: "Кабинет мастера",
      providerSecondary: "Лента заказов",
      buyerPrimary: "Создать заявку",
      buyerSecondary: "Мои заявки",
    },
    en: {
      providerPrimary: "Provider Dashboard",
      providerSecondary: "Available Requests",
      buyerPrimary: "Create Request",
      buyerSecondary: "My Requests",
    },
  }[locale] ?? {
    providerPrimary: "Кабинет мастера",
    providerSecondary: "Лента заказов",
    buyerPrimary: "Создать заявку",
    buyerSecondary: "Мои заявки",
  };

  return (
    <section className="relative overflow-hidden bg-white pt-24 pb-14 md:pt-28 md:pb-20 lg:pt-28 lg:pb-22">
      {/* Background silk waves */}
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
            className="lg:col-span-6 xl:col-span-6 text-center lg:text-left z-10"
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50/80 border border-blue-200/70 text-blue-600 text-[11px] sm:text-xs font-bold tracking-wide uppercase shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-blue-500 fill-blue-500/20" />
              <span>{t.landing.hero.badge}</span>
            </div>

            <h1 className="mt-5 font-display text-[1.85rem] sm:text-4xl md:text-5xl lg:text-[3.4rem] font-extrabold leading-[1.14] tracking-tight text-gray-900">
              <span className="block">{t.landing.hero.headlineLine1}</span>
              <span className="block text-blue-600">
                <RotatingWord words={t.landing.rotateWords} />
              </span>
              <span className="block">{t.landing.hero.headlineLine3}</span>
            </h1>

            <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
              {t.landing.hero.subtext}
            </p>

            {/* Context-aware CTA actions */}
            <div className="mt-7 flex flex-col sm:flex-row gap-3.5 justify-center lg:justify-start items-stretch sm:items-center">
              {user ? (
                user.role === "provider" ? (
                  <>
                    <Link href="/dashboard/provider">
                      <Button
                        size="lg"
                        className="w-full sm:w-auto h-12 sm:h-13 px-7 rounded-2xl font-bold text-sm sm:text-base gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25"
                      >
                        {roleCopy.providerPrimary}
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link href="/provider/requests">
                      <Button
                        size="lg"
                        variant="outline"
                        className="w-full sm:w-auto h-12 sm:h-13 px-7 rounded-2xl font-bold text-sm sm:text-base border border-gray-200 bg-white/90 hover:bg-white text-gray-800 shadow-sm hover:border-gray-300"
                      >
                        {roleCopy.providerSecondary}
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/questionnaire">
                      <Button
                        size="lg"
                        className="w-full sm:w-auto h-12 sm:h-13 px-7 rounded-2xl font-bold text-sm sm:text-base gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25"
                      >
                        {roleCopy.buyerPrimary}
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link href="/my-requests">
                      <Button
                        size="lg"
                        variant="outline"
                        className="w-full sm:w-auto h-12 sm:h-13 px-7 rounded-2xl font-bold text-sm sm:text-base border border-gray-200 bg-white/90 hover:bg-white text-gray-800 shadow-sm hover:border-gray-300"
                      >
                        {roleCopy.buyerSecondary}
                      </Button>
                    </Link>
                  </>
                )
              ) : (
                <>
                  <Link href="/questionnaire">
                    <Button
                      size="lg"
                      className="w-full sm:w-auto h-12 sm:h-13 px-7 rounded-2xl font-bold text-sm sm:text-base gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25"
                    >
                      {t.landing.hero.startSurvey}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                  <a href="/provider/">
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full sm:w-auto h-12 sm:h-13 px-7 rounded-2xl font-bold text-sm sm:text-base border border-gray-200 bg-white/90 hover:bg-white text-gray-800 shadow-sm hover:border-gray-300"
                    >
                      {t.landing.hero.becomeProvider}
                    </Button>
                  </a>
                </>
              )}
            </div>

            {/* Trust points */}
            <div className="mt-8 sm:mt-9 pt-2 grid grid-cols-3 gap-2 sm:gap-4 lg:flex lg:flex-row lg:flex-nowrap lg:gap-6 xl:gap-7 justify-center lg:justify-start max-w-md sm:max-w-lg lg:max-w-none mx-auto lg:mx-0">
              {trust.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2.5 lg:gap-3 text-center sm:text-left shrink-0"
                >
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-50/90 border border-blue-100 flex items-center justify-center text-blue-600 shadow-xs shrink-0">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <span className="text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-700 leading-tight max-w-[120px]">
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
            className="lg:col-span-6 xl:col-span-6 relative flex items-center justify-center lg:justify-end mt-8 lg:mt-0"
          >
            <div className="relative w-full max-w-[340px] sm:max-w-[460px] lg:max-w-[520px] xl:max-w-[560px] lg:ml-auto lg:mr-0 lg:translate-x-4 xl:translate-x-6">
              <img
                src="/images/hero.png"
                alt={t.landing.hero.surveyAlt}
                width={560}
                height={420}
                className="w-full h-auto object-contain select-none pointer-events-none drop-shadow-2xl mx-auto lg:ml-auto lg:mr-0 aspect-[4/3]"
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
  const { t, locale } = useI18n();
  const [roleTab, setRoleTab] = useState<"buyer" | "provider">("buyer");

  const ICONS_BUYER = [ClipboardList, Search, MessageSquare, CreditCard];
  const ICONS_PROVIDER = [UserCheck, ListFilter, MessageSquare, Award];
  const NUMS = ["01", "02", "03", "04"];

  const providerSteps = {
    uz: [
      {
        title: "Ro'yxatdan o'tish",
        desc: "Profilingizni bepul yarating, xizmatlaringiz va ish hududlaringizni belgilang.",
      },
      {
        title: "Buyurtmalarni tanlash",
        desc: "Yangi buyurtmalar haqida bildirishnoma oling va qulaylariga Tanga orqali taklif yuboring.",
      },
      {
        title: "To'g'ridan-to'g'ri muloqot",
        desc: "Mijoz bilan chatda narx, shartlar va qulay vaqtni vositachilarsiz kelishib oling.",
      },
      {
        title: "Daromad va obro'",
        desc: "Ishni yakunlang, 100% to'lovni oling va reytingingizni oshirib yangi mijozlarga ega bo'ling.",
      },
    ],
    ru: [
      {
        title: "Быстрая регистрация",
        desc: "Создайте профиль исполнителя, выберите категории услуг и районы работы.",
      },
      {
        title: "Выбирайте заказы",
        desc: "Получайте уведомления о свежих заявках и откликайтесь за Tanga без абонентской платы.",
      },
      {
        title: "Прямой чат",
        desc: "Общайтесь с заказчиком напрямую, обсуждайте детали и согласовывайте окончательную цену.",
      },
      {
        title: "Оплата и репутация",
        desc: "Получайте 100% оплаты от клиента и повышайте свой рейтинг честными отзывами.",
      },
    ],
    en: [
      {
        title: "Quick Registration",
        desc: "Create your free provider profile, select services and set your operating service areas.",
      },
      {
        title: "Select Job Requests",
        desc: "Receive real-time notifications of new requests and send quotes using low-cost Tanga.",
      },
      {
        title: "Direct Chat",
        desc: "Message customers directly in real-time, clarify job specs, and agree on pricing.",
      },
      {
        title: "Get Paid & Build Trust",
        desc: "Complete the job, receive 100% of customer payment, and earn 5-star ratings.",
      },
    ],
  }[locale] ?? [
    { title: "Регистрация", desc: "Создайте профиль исполнителя." },
    { title: "Выбирайте заказы", desc: "Откликайтесь на свежие заявки." },
    { title: "Прямой чат", desc: "Общайтесь с заказчиком напрямую." },
    { title: "Оплата и репутация", desc: "Получайте оплату и растите рейтинг." },
  ];

  const currentSteps = roleTab === "buyer" ? t.landing.howItWorks.steps : providerSteps;
  const currentIcons = roleTab === "buyer" ? ICONS_BUYER : ICONS_PROVIDER;

  const tabLabels = {
    uz: { buyer: "Mijozlar uchun", provider: "Ijrochilar uchun" },
    ru: { buyer: "Для клиентов", provider: "Для мастеров" },
    en: { buyer: "For Customers", provider: "For Providers" },
  }[locale] ?? { buyer: "Для клиентов", provider: "Для мастеров" };

  return (
    <section id="how-it-works" className="py-24 md:py-28 bg-gray-50 scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-center mb-10"
        >
          <span className="pill-label mb-5 inline-flex">{t.landing.howItWorks.pill}</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
            {t.landing.howItWorks.titleA}{" "}
            <span className="text-gradient">{t.landing.howItWorks.titleB}</span>
          </h2>
        </motion.div>

        {/* Tab switcher: Customer vs Provider */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex p-1.5 rounded-2xl bg-gray-200/70 border border-gray-200 shadow-inner">
            <button
              type="button"
              onClick={() => setRoleTab("buyer")}
              className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                roleTab === "buyer"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tabLabels.buyer}
            </button>
            <button
              type="button"
              onClick={() => setRoleTab("provider")}
              className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                roleTab === "provider"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tabLabels.provider}
            </button>
          </div>
        </div>

        {/* Desktop Step Grid */}
        <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-5 relative">
          <div className="hidden lg:block absolute top-11 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent pointer-events-none" />
          {currentSteps.map((step, i) => {
            const Icon = currentIcons[i] ?? ClipboardList;
            return (
              <motion.div
                key={`${roleTab}-${i}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.5, ease: EASE }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="relative bg-white rounded-2xl p-6 border border-gray-100 card-shadow hover:card-shadow-hover hover:border-blue-100 transition-[box-shadow,border-color] duration-200 ease-out"
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

        {/* Mobile Connected Vertical Stepper (Clear chronological flow without horizontal scrolling) */}
        <div className="sm:hidden relative">
          <div className="space-y-3">
            {currentSteps.map((step, i) => {
              const Icon = currentIcons[i] ?? ClipboardList;
              const isLast = i === currentSteps.length - 1;
              return (
                <div key={`mobile-step-${roleTab}-${i}`} className="relative flex items-start gap-3.5">
                  {/* Step indicator column with connecting line */}
                  <div className="flex flex-col items-center shrink-0 self-stretch">
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs ring-4 ring-blue-50 z-10 shrink-0">
                      {NUMS[i]}
                    </div>
                    {!isLast && (
                      <div className="w-0.5 flex-1 bg-gradient-to-b from-blue-300 via-blue-200 to-blue-100 my-1" />
                    )}
                  </div>

                  {/* Step Card Content */}
                  <div className="flex-1 bg-white rounded-2xl p-4 border border-gray-100/90 card-shadow text-left mb-1">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <h3 className="text-sm font-bold text-gray-900 leading-snug">{step.title}</h3>
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <p className="text-gray-500 text-xs leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function CategoriesSection() {
  const { t, locale } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllMobileCategories, setShowAllMobileCategories] = useState(false);
  const activeCategories = getActiveCategories();

  // Dynamic categories with fallback
  const baseList = activeCategories.length > 0
    ? activeCategories.map((c) => ({
        id: c.id,
        name: getCategoryDisplayName(c.id, locale, getLocalizedText(c.nameLocalized, locale)),
        desc: c.descriptionLocalized ? getLocalizedText(c.descriptionLocalized, locale) : "",
      }))
    : t.landing.categories.list;

  // Filter in real time by query
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return baseList;
    const q = searchQuery.toLowerCase().trim();
    return baseList.filter(
      (cat) =>
        cat.name.toLowerCase().includes(q) ||
        cat.desc.toLowerCase().includes(q)
    );
  }, [baseList, searchQuery]);

  const searchPlaceholder = {
    uz: "Qidirish: santexnik, tozalash, avto, repetitor...",
    ru: "Поиск услуги: ремонт, уборка, авто, репетитор...",
    en: "Search service: plumbing, cleaning, auto, tutor...",
  }[locale] ?? "Поиск услуги...";

  const noResultsText = {
    uz: "Bunday xizmat topilmadi",
    ru: "Такая услуга не найдена",
    en: "No matching category found",
  }[locale] ?? "Услуга не найдена";

  return (
    <section id="categories" className="py-24 md:py-28 bg-white scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-center mb-8"
        >
          <span className="pill-label mb-5 inline-flex">{t.landing.categories.pill}</span>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-3 text-gray-900">
            <span className="text-gradient">
              {activeCategories.length > 0
                ? (locale === "uz" ? `${activeCategories.length} ta` : `${activeCategories.length}`)
                : t.landing.categories.titleA}
            </span>{" "}
            {t.landing.categories.titleB}
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto text-base leading-relaxed">
            {t.landing.categories.desc}
          </p>
        </motion.div>

        {/* Real-time category search filter */}
        <div className="max-w-md mx-auto mb-10">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Filter service categories"
              className="w-full h-12 pl-11 pr-10 rounded-2xl bg-gray-50 border border-gray-200/90 focus:border-blue-500 focus:bg-white text-base md:text-sm font-medium text-gray-900 placeholder:text-gray-400 transition-[border-color,background-color] duration-150 outline-hidden shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-3.5 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {filteredList.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-2xl bg-gray-50 border border-dashed border-gray-200 max-w-md mx-auto">
            <p className="text-sm font-semibold text-gray-600 mb-4">{noResultsText}</p>
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="cursor-pointer"
              >
                Сбросить поиск
              </Button>
              <Link href="/questionnaire">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 cursor-pointer">
                  {t.landing.hero.startSurvey}
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Detailed Category Grid */}
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredList.map((cat, i) => (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (i % 3) * 0.05, duration: 0.4, ease: EASE }}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                >
                  <Link
                    href={`/questionnaire?cat=${cat.id}`}
                    className="group text-left bg-white rounded-2xl border border-gray-100 p-5 card-shadow hover:card-shadow-hover hover:border-blue-100 transition-[box-shadow,border-color] duration-200 ease-out flex items-center gap-4 block cursor-pointer"
                  >
                    <CategoryIcon categoryId={cat.id} size={48} className="shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-base text-gray-900 group-hover:text-blue-600 transition-colors">
                        {cat.name}
                      </h3>
                      <p className="text-gray-500 text-sm leading-snug truncate">{cat.desc}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-blue-500 ml-auto opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-150 ease-out shrink-0" />
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Mobile Native App Category Grid */}
            <div className="sm:hidden space-y-3">
              <div className="grid grid-cols-3 gap-2.5">
                {(searchQuery.trim() || showAllMobileCategories ? filteredList : filteredList.slice(0, 6)).map((cat) => (
                  <Link
                    key={`mobile-${cat.id}`}
                    href={`/questionnaire?cat=${cat.id}`}
                    className="group bg-white rounded-2xl border border-gray-100 p-3 card-shadow active:scale-95 transition-[transform,border-color,box-shadow] duration-150 ease-out flex flex-col items-center text-center cursor-pointer"
                  >
                    <CategoryIcon categoryId={cat.id} size={38} className="shrink-0 rounded-xl shadow-2xs" />
                    <span className="font-bold text-xs text-gray-900 mt-2 line-clamp-1 leading-tight group-hover:text-blue-600">
                      {cat.name}
                    </span>
                  </Link>
                ))}
              </div>

              {!searchQuery.trim() && filteredList.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllMobileCategories(!showAllMobileCategories)}
                  className="w-full py-2.5 px-4 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200/80 text-xs font-bold text-gray-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>
                    {showAllMobileCategories
                      ? (locale === "uz" ? "Yopish" : "Свернуть")
                      : `${locale === "uz" ? "Barcha xizmatlar" : "Все категории"} (${filteredList.length})`}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      showAllMobileCategories ? "rotate-180" : ""
                    }`}
                  />
                </button>
              )}
            </div>
          </>
        )}
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
  const [activeSlide, setActiveSlide] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (diff > 45) {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    } else if (diff < -45) {
      setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length);
    }
    setTouchStart(null);
  };

  const slides = useMemo(() => [
    {
      id: "survey",
      tab: s.survey.tag.replace(/^\d+\.\s*/, ""),
      tag: s.survey.tag,
      title: s.survey.title,
      desc: s.survey.desc,
      bullets: s.survey.bullets,
      media: (
        <CardFrame
          src="/showcase/survey-question.jpg"
          alt={s.survey.title}
          className="w-full max-w-[320px] aspect-[16/10] mx-auto"
        />
      ),
    },
    {
      id: "profile",
      tab: s.profile.tag.replace(/^\d+\.\s*/, ""),
      tag: s.profile.tag,
      title: s.profile.title,
      desc: s.profile.desc,
      bullets: s.profile.bullets,
      media: (
        <PhoneFrame
          src="/showcase/ppp.jpg"
          alt={s.profile.title}
          className="w-[210px] aspect-[9/19] mx-auto"
        />
      ),
    },
    {
      id: "reviews",
      tab: s.reviews.tag.replace(/^\d+\.\s*/, ""),
      tag: s.reviews.tag,
      title: s.reviews.title,
      desc: s.reviews.desc,
      bullets: s.reviews.bullets,
      media: (
        <PhoneFrame
          src="/showcase/reviews.jpg"
          alt={s.reviews.title}
          className="w-[210px] aspect-[9/19] mx-auto"
        />
      ),
    },
    {
      id: "badges",
      tab: s.badges.tag.replace(/^\d+\.\s*/, ""),
      tag: s.badges.tag,
      title: s.badges.title,
      desc: s.badges.desc,
      bullets: s.badges.bullets,
      media: (
        <CardFrame
          src="/showcase/badges.jpg"
          alt={s.badges.title}
          className="w-full max-w-[320px] aspect-[16/10] mx-auto"
        />
      ),
    },
    {
      id: "review",
      tab: s.review.tag.replace(/^\d+\.\s*/, ""),
      tag: s.review.tag,
      title: s.review.title,
      desc: s.review.desc,
      bullets: s.review.bullets,
      media: (
        <CardFrame
          src="/showcase/review.jpg"
          alt={s.review.title}
          className="w-full max-w-[320px] aspect-[16/10] mx-auto"
        />
      ),
    },
  ], [s]);

  const current = slides[activeSlide] ?? slides[0];

  return (
    <section id="showcase" className="py-24 md:py-28 bg-gray-50 overflow-hidden scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-center mb-12 sm:mb-16 md:mb-20"
        >
          <span className="pill-label mb-5 inline-flex">{s.pill}</span>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-3 text-gray-900">{s.title}</h2>
          <p className="text-gray-500 max-w-xl mx-auto text-base leading-relaxed">{s.desc}</p>
        </motion.div>

        {/* Desktop alternating rows */}
        <div className="hidden lg:block space-y-20 md:space-y-28">
          <ShowcaseRow
            tag={s.survey.tag}
            title={s.survey.title}
            desc={s.survey.desc}
            bullets={s.survey.bullets}
            media={
              <CardFrame
                src="/showcase/survey-question.jpg"
                alt={s.survey.title}
                className="w-full max-w-[380px] aspect-[16/10]"
              />
            }
          />
          <ShowcaseRow
            reverse
            tag={s.profile.tag}
            title={s.profile.title}
            desc={s.profile.desc}
            bullets={s.profile.bullets}
            media={
              <PhoneFrame
                src="/showcase/ppp.jpg"
                alt={s.profile.title}
                className="w-[250px] aspect-[9/19]"
              />
            }
          />
          <ShowcaseRow
            tag={s.reviews.tag}
            title={s.reviews.title}
            desc={s.reviews.desc}
            bullets={s.reviews.bullets}
            media={
              <PhoneFrame
                src="/showcase/reviews.jpg"
                alt={s.reviews.title}
                className="w-[250px] aspect-[9/19]"
              />
            }
          />
          <ShowcaseRow
            reverse
            tag={s.badges.tag}
            title={s.badges.title}
            desc={s.badges.desc}
            bullets={s.badges.bullets}
            media={
              <CardFrame
                src="/showcase/badges.jpg"
                alt={s.badges.title}
                className="w-full max-w-[380px] aspect-[16/10]"
              />
            }
          />
          <ShowcaseRow
            tag={s.review.tag}
            title={s.review.title}
            desc={s.review.desc}
            bullets={s.review.bullets}
            media={
              <CardFrame
                src="/showcase/review.jpg"
                alt={s.review.title}
                className="w-full max-w-[360px] aspect-[16/10]"
              />
            }
          />
        </div>

        {/* Mobile Interactive Tabbed Showcase */}
        <div className="block lg:hidden">
          {/* Scrollable pill tab bar */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3.5 -mx-4 px-4 mb-2">
            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setActiveSlide(idx)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  activeSlide === idx
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-500/25"
                    : "bg-white text-gray-600 border border-gray-200/80 hover:bg-gray-50"
                }`}
              >
                {slide.tab}
              </button>
            ))}
          </div>

          {/* Active slide card with touch swipe */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="bg-white rounded-3xl p-5 border border-gray-100 card-shadow select-none touch-pan-y"
          >
            {/* Visual preview */}
            <div className="mb-5 flex justify-center py-2 bg-gray-50/70 rounded-2xl border border-gray-100/80">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.22 }}
                  className="w-full flex justify-center"
                >
                  {current.media}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Info details */}
            <div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600 mb-2">
                {current.tag}
              </span>
              <h3 className="text-lg font-extrabold text-gray-900 mb-2 leading-snug">
                {current.title}
              </h3>
              <p className="text-gray-500 text-xs sm:text-sm leading-relaxed mb-4">
                {current.desc}
              </p>
              <ul className="space-y-2 mb-4">
                {current.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                    <span className="text-xs font-semibold text-gray-800 leading-snug">{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Pagination dots & controls */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setActiveSlide((activeSlide - 1 + slides.length) % slides.length)}
                aria-label="Previous feature"
                className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5">
                {slides.map((_, dotIdx) => (
                  <button
                    key={dotIdx}
                    type="button"
                    onClick={() => setActiveSlide(dotIdx)}
                    aria-label={`Go to slide ${dotIdx + 1}`}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      dotIdx === activeSlide ? "w-6 bg-blue-600" : "w-2 bg-gray-200"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setActiveSlide((activeSlide + 1) % slides.length)}
                aria-label="Next feature"
                className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BuyerBenefitsSection() {
  const { t } = useI18n();
  const ICONS = [ShieldCheck, ClipboardList, MessageSquare, CreditCard];

  return (
    <section id="buyer-benefits" className="py-24 md:py-28 bg-white scroll-mt-24">
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

        {/* Desktop 4-column feature grid */}
        <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {t.landing.buyerBenefits.features.map((feat, i) => {
            const Icon = ICONS[i] ?? ShieldCheck;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.08 + i * 0.09, duration: 0.6 }}
                className="bg-gray-50 border border-gray-100 rounded-xl p-5 hover:bg-blue-50/50 hover:border-blue-100 transition-[background-color,border-color] duration-150 ease-out card-shadow"
              >
                <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center mb-3.5 shadow-2xs">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-sm font-bold mb-1.5 text-gray-900">{feat.title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{feat.desc}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Mobile 2x2 compact grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:hidden">
          {t.landing.buyerBenefits.features.map((feat, i) => {
            const Icon = ICONS[i] ?? ShieldCheck;
            return (
              <div
                key={`mobile-feat-${i}`}
                className="bg-gray-50 border border-gray-100 rounded-2xl p-3.5 card-shadow flex flex-col justify-between"
              >
                <div className="w-8 h-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center mb-2.5 shadow-2xs">
                  <Icon className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xs font-bold mb-1 text-gray-900 leading-snug">{feat.title}</h3>
                  <p className="text-gray-500 text-[11px] leading-tight">{feat.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ProviderSection() {
  const { t, locale } = useI18n();
  const { user } = useAuth();

  const isProvider = user?.role === "provider";

  const providerBenefits = {
    uz: [
      "Ro'yxatdan o'tganda dastlabki takliflar uchun +10 Tanga bonus",
      "Reklama xarajatlarisiz bevosita mahalliy buyurtmalarni oling",
      "Portfel va mijozlar sharhlari orqali ishonchli obro' yarating",
      "Barcha buyurtmalar va chatlarni qulay yagona kabinetda boshqaring",
    ],
    ru: [
      "Бонус +10 Tanga при регистрации на первые отклики",
      "Получайте местных клиентов напрямую без затрат на рекламу",
      "Зарабатывайте репутацию портфолио и реальными отзывами",
      "Управляйте всеми заказами и чатами в едином удобном кабинете",
    ],
    en: [
      "Get a +10 bonus Tanga upon signup for your first job offers",
      "Acquire local customers directly without advertising expenditures",
      "Build your professional reputation with portfolios and reviews",
      "Manage all inbound requests and live chats from a single dashboard",
    ],
  }[locale] ?? t.landing.provider.benefits;

  return (
    <section id="provider-benefits" className="py-24 md:py-28 bg-gray-50 scroll-mt-24">
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

        {/* Mobile bonus callout */}
        <div className="sm:hidden mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
            <Gift className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-blue-900 leading-tight">
            {locale === "uz"
              ? "Ro'yxatdan o'tganingizda dastlabki takliflar uchun +10 Tanga bonus!"
              : "Бонус +10 Tanga на первые отклики сразу после регистрации!"}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4 max-w-3xl mx-auto mb-8 sm:mb-10">
          {providerBenefits.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.08 + i * 0.08, duration: 0.6 }}
              className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl p-3.5 sm:p-5 card-shadow"
            >
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-600 shrink-0 flex items-center justify-center mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-gray-700 font-medium text-xs sm:text-sm leading-relaxed">{item}</span>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <a href={isProvider ? "/provider/requests" : "/provider/"}>
            <Button
              size="lg"
              className="w-full sm:w-auto h-12 px-7 rounded-xl font-semibold text-sm gap-2 bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-200 cursor-pointer"
            >
              {isProvider ? "Смотреть заказы" : t.landing.provider.becomeProvider}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
}

function TangaSection() {
  const { t } = useI18n();
  const ICONS = [Users, Coins, Wallet];

  return (
    <section id="pricing" className="py-24 md:py-28 bg-white scroll-mt-24">
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

        {/* Desktop 3 Core Value Cards */}
        <div className="hidden md:grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {t.landing.tanga.points.map((p, i) => {
            const Icon = ICONS[i] ?? Coins;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.7, ease: EASE }}
                className="bg-gray-50 rounded-2xl p-7 border border-gray-100 card-shadow hover:card-shadow-hover transition-[box-shadow] duration-200 ease-out"
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

        {/* Mobile Vertical Stacked Cards (All 3 clearly visible without horizontal scrolling) */}
        <div className="flex flex-col gap-3 md:hidden">
          {t.landing.tanga.points.map((p, i) => {
            const Icon = ICONS[i] ?? Coins;
            return (
              <div
                key={`mobile-tanga-${i}`}
                className="bg-gray-50 rounded-2xl p-4 border border-gray-100/90 card-shadow flex items-start gap-3.5 text-left transition-all active:scale-[0.99]"
              >
                <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-gray-900 mb-1 leading-snug">{p.title}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">{p.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Bonus callout & link */}
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
          <Link href="/plans">
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-7 rounded-xl font-semibold text-sm gap-2 bg-white text-gray-800 border-gray-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 transition-all duration-200 cursor-pointer"
            >
              {t.landing.tanga.cta}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function CTASection() {
  const { t, locale } = useI18n();

  const trustBadges = {
    uz: [
      "Bepul so'rov joylash",
      "Yashirin to'lovlarsiz",
      "Tekshirilgan ustalar",
    ],
    ru: [
      "Бесплатное создание заявки",
      "Без скрытых комиссий",
      "Проверенные специалисты",
    ],
    en: [
      "Free request submission",
      "Zero hidden fees",
      "Verified specialists",
    ],
  }[locale] ?? [
    "Бесплатное создание заявки",
    "Без скрытых комиссий",
    "Проверенные специалисты",
  ];

  return (
    <section className="py-20 md:py-28 bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: EASE }}
          className="relative rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 border border-blue-400/30 p-6 sm:p-12 md:p-16 text-center overflow-hidden shadow-2xl shadow-blue-900/30"
        >
          {/* Subtle silk wave texture & atmospheric glow in brand blue theme */}
          <div
            className="absolute inset-0 bg-cover bg-center opacity-15 pointer-events-none mix-blend-overlay"
            style={{ backgroundImage: "url('/images/hero-bg.png')" }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(255, 255, 255, 0.18) 0%, rgba(30, 58, 138, 0) 100%)",
            }}
          />

          <div className="relative z-10 max-w-2xl mx-auto">
            {/* Elegant brand pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 border border-white/20 text-white text-xs font-semibold tracking-wide backdrop-blur-md mb-6">
              <Sparkles className="w-3.5 h-3.5 text-blue-200" />
              <span>Hormang Marketplace</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white font-display">
              {t.landing.cta.title}
            </h2>

            <p className="mt-4 text-base sm:text-lg text-blue-100 leading-relaxed max-w-xl mx-auto">
              {t.landing.cta.desc}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3.5 justify-center items-stretch sm:items-center">
              <Link href="/questionnaire" className="w-full sm:w-auto">
                <button
                  type="button"
                  style={{ color: "#ffffff" }}
                  className="group relative w-full sm:w-auto h-12 px-7 rounded-xl font-semibold text-sm gap-2.5 inline-flex items-center justify-center bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white hover:text-white border border-blue-400/50 hover:border-white/50 shadow-[0_2px_8px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.3)] hover:shadow-[0_6px_20px_rgba(29,78,216,0.4),inset_0_1px_0_rgba(255,255,255,0.45)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] transition-[transform,box-shadow,border-color] duration-150 ease-out cursor-pointer select-none"
                >
                  <Users className="w-4 h-4 text-white shrink-0 transition-transform duration-200 group-hover:scale-105" />
                  <span className="text-white hover:text-white tracking-wide">{t.landing.cta.asCustomer}</span>
                  <ArrowRight className="w-4 h-4 text-white/80 group-hover:text-white group-hover:translate-x-1 transition-transform duration-150 ease-out shrink-0" />
                </button>
              </Link>
              <a href="/provider/" className="w-full sm:w-auto">
                <button
                  type="button"
                  style={{ color: "#ffffff" }}
                  className="group relative w-full sm:w-auto h-12 px-7 rounded-xl font-semibold text-sm gap-2.5 inline-flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.16] text-white hover:text-white border border-white/20 hover:border-white/40 shadow-[0_2px_8px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_6px_18px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.25)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] transition-[transform,box-shadow,border-color,background-color] duration-150 ease-out backdrop-blur-md cursor-pointer select-none"
                >
                  <Sparkles className="w-4 h-4 text-white/90 group-hover:text-white group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300 shrink-0" />
                  <span className="text-white hover:text-white tracking-wide">{t.landing.cta.becomeProvider}</span>
                </button>
              </a>
            </div>

            {/* Bottom trust checks */}
            <div className="mt-10 pt-7 border-t border-blue-400/25 flex flex-wrap items-center justify-center gap-6 text-xs font-semibold text-blue-100/90">
              {trustBadges.map((badge) => (
                <span key={badge} className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function MobileStickyBar() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show when user scrolls past 340px and is not authenticated (since BottomNav handles auth users)
      const isPastHero = window.scrollY > 340;
      setVisible(isPastHero && !user);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [user]);

  const copy = {
    uz: { prompt: "Usta kerakmi?", action: "Topish" },
    ru: { prompt: "Нужен мастер?", action: "Найти мастера" },
    en: { prompt: "Need a pro?", action: "Get Started" },
  }[locale] ?? { prompt: "Нужен мастер?", action: "Найти мастера" };

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          initial={{ y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 90, opacity: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
          aria-label="Quick mobile action"
          className="md:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] left-3 right-3 z-40 max-w-md mx-auto"
        >
          <div className="bg-slate-900/95 text-white backdrop-blur-md rounded-2xl p-2.5 px-3.5 border border-slate-700/80 shadow-2xl shadow-blue-950/40 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-extrabold flex items-center justify-center text-xs shadow-xs shrink-0">
                H
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate leading-tight">
                  {copy.prompt}
                </p>
                <p className="text-[10px] text-slate-300 truncate leading-tight mt-0.5">
                  Hormang Marketplace
                </p>
              </div>
            </div>

            <Link href="/questionnaire">
              <button
                type="button"
                className="h-9 px-4 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-500 text-white gap-1.5 flex items-center justify-center shadow-md shadow-blue-500/25 active:scale-95 transition-[transform,background-color,box-shadow] duration-150 ease-out cursor-pointer shrink-0"
              >
                <span>{copy.action}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </Link>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 pb-16 md:pb-0">
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
      <MobileStickyBar />
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
