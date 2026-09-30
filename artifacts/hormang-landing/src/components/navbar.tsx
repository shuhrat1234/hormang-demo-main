import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, LogOut, User, Globe, Check, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { LOCALES } from "@/lib/i18n";
import logoImg from "/hormang-logo.png";

function LanguageSwitcher({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const { locale, setLocale } = useI18n();
  if (variant === "mobile") {
    return (
      <div className="flex items-center gap-1.5">
        {LOCALES.map((l) => (
          <button
            key={l.code}
            onClick={() => setLocale(l.code)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-bold transition-colors ${
              locale === l.code ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-gray-50 text-gray-500 border border-gray-100 hover:bg-gray-100"
            }`}
          >
            <span className="uppercase">{l.code}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors">
          <Globe className="w-4 h-4" />
          <span className="uppercase">{locale}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {LOCALES.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => setLocale(l.code)} className="gap-2 cursor-pointer">
            <span className="uppercase text-xs font-bold text-gray-400 w-5">{l.code}</span>
            <span className="flex-1">{l.name}</span>
            {locale === l.code && <Check className="w-3.5 h-3.5 text-blue-600" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [logoHovered, setLogoHovered] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 16);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: t.navbar.services, href: "#categories" },
    { name: t.navbar.howItWorks, href: "#how-it-works" },
    { name: t.navbar.pricing, href: "#pricing" },
  ];

  async function handleLogout() {
    await logout();
    setLocation("/");
  }

  return (
    <motion.header
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-white/95 backdrop-blur-md shadow-[0_1px_0_0_rgba(0,0,0,0.06)] py-3"
          : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 group"
            onMouseEnter={() => setLogoHovered(true)}
            onMouseLeave={() => setLogoHovered(false)}
          >
            <motion.img
              src={logoImg}
              alt="Hormang logo"
              animate={logoHovered
                ? { rotate: [-8, 8], transition: { repeat: Infinity, repeatType: "reverse", duration: 0.35, ease: "easeInOut" } }
                : { rotate: 0, transition: { duration: 0.25, ease: "easeOut" } }
              }
              className="w-13 h-13 object-contain drop-shadow-sm"
            />
            <span className="font-extrabold text-xl tracking-tight text-gray-900">Hormang</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            <ul className="flex items-center gap-5">
              {navLinks.map((link, i) => (
                <motion.li
                  key={link.name}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.07 }}
                >
                  <a
                    href={link.href}
                    className="text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors duration-200"
                  >
                    {link.name}
                  </a>
                </motion.li>
              ))}
            </ul>

            <LanguageSwitcher />

            <div className="flex items-center gap-3 border-l border-gray-200 pl-3">
              {user ? (
                <>
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileHover={{ scale: 1.03 }}
                    onClick={() => setLocation(user.role === "provider" ? "/dashboard/provider" : "/dashboard/buyer")}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      {user.firstName[0]}
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{user.firstName}</span>
                  </motion.button>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLogout}
                      className="text-gray-500 hover:text-gray-800 hover:bg-gray-100 active:bg-gray-200 gap-1.5 font-medium transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      {t.navbar.logout}
                    </Button>
                  </motion.div>
                </>
              ) : (
                <>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                    <Button
                      variant="ghost"
                      className="font-semibold text-gray-600 hover:text-blue-600 hover:bg-blue-50/80 active:bg-blue-100 gap-1.5 transition-colors"
                      onClick={() => setLocation("/auth/login")}
                    >
                      <User className="w-3.5 h-3.5" />
                      {t.navbar.login}
                    </Button>
                  </motion.div>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.38 }}>
                    <Button
                      className="font-semibold bg-blue-600 hover:bg-blue-700 hover:brightness-105 active:scale-[0.98] shadow-sm transition-all gap-1.5"
                      onClick={() => setLocation("/auth/role")}
                    >
                      {t.navbar.signup}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </motion.div>
                </>
              )}
            </div>
          </nav>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 -mr-2 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mobileMenuOpen ? "close" : "open"}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.16 }}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </motion.div>
            </AnimatePresence>
          </button>
        </div>
      </div>
      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden overflow-hidden bg-white border-b border-gray-100 shadow-sm"
          >
            <div className="p-4 flex flex-col gap-1">
              <div className="pb-3 mb-2 border-b border-gray-100">
                <LanguageSwitcher variant="mobile" />
              </div>
              {navLinks.map((link, i) => (
                <motion.a
                  key={link.name}
                  href={link.href}
                  initial={{ x: -16, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                >
                  {link.name}
                </motion.a>
              ))}
              <div className="border-t border-gray-100 pt-3 mt-2 flex flex-col gap-2">
                {user ? (
                  <>
                    <Button
                      variant="outline"
                      className="w-full font-semibold bg-white text-gray-700 border-gray-200 hover:bg-blue-50/80 hover:text-blue-600"
                      onClick={() => { setMobileMenuOpen(false); setLocation(user.role === "provider" ? "/dashboard/provider" : "/dashboard/buyer"); }}
                    >
                      {user.firstName} {user.lastName}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full font-semibold gap-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                      onClick={handleLogout}
                    >
                      <LogOut className="w-4 h-4" /> {t.navbar.logout}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="w-full font-semibold bg-white border-gray-200 text-gray-700 hover:text-blue-600 hover:bg-blue-50/80 hover:border-blue-300 transition-all"
                      onClick={() => { setMobileMenuOpen(false); setLocation("/auth/login"); }}
                    >
                      {t.navbar.login}
                    </Button>
                    <Button
                      className="w-full font-semibold bg-blue-600 hover:bg-blue-700 hover:brightness-105 active:scale-[0.98] transition-all"
                      onClick={() => { setMobileMenuOpen(false); setLocation("/auth/role"); }}
                    >
                      {t.navbar.signup}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
