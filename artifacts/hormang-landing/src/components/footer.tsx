import { useState } from "react";
import { Link } from "wouter";
import { Instagram, Send, Facebook, MapPin, Mail, Phone } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/contexts/i18n-context";
import { LegalModal, type LegalDocType } from "@/components/legal-modal";

const socialLinks = [
  { icon: Instagram, href: "https://www.instagram.com/hormangapp", label: "Instagram" },
  { icon: Send, href: "https://t.me/hormangapp", label: "Telegram" },
  { icon: Facebook, href: "https://www.facebook.com/hormangapp", label: "Facebook" },
];

export function Footer() {
  const { t } = useI18n();
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null);

  const getCustomerLinkProps = (index: number) => {
    switch (index) {
      case 0:
        return { href: "#how-it-works", isAnchor: true };
      case 1:
        return { href: "#categories", isAnchor: true };
      case 2:
        return { onClick: () => setLegalDoc("safety"), isAction: true };
      case 3:
      default:
        return { href: "#showcase", isAnchor: true };
    }
  };

  const getProviderLinkProps = (index: number) => {
    switch (index) {
      case 0:
        return { href: "/auth/role", isRoute: true };
      case 1:
        return { href: "/plans", isRoute: true };
      case 2:
      default:
        return { onClick: () => setLegalDoc("terms"), isAction: true };
    }
  };

  return (
    <>
      <footer className="bg-gray-50 border-t border-gray-100 pt-16 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10 mb-12">
            {/* Brand column */}
            <div className="space-y-5">
              <Link href="/" className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-extrabold text-lg bg-blue-600 shadow-sm">
                  H
                </div>
                <span className="font-extrabold text-xl tracking-tight text-gray-900">Hormang</span>
              </Link>
              <p className="text-gray-500 leading-relaxed text-sm">
                {t.footer.tagline}
              </p>
              <div className="flex gap-2.5 pt-1">
                {socialLinks.map(({ icon: Icon, href, label }) => (
                  <motion.a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    whileHover={{ scale: 1.1, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-colors duration-200 shadow-xs"
                  >
                    <Icon className="w-4 h-4" />
                  </motion.a>
                ))}
              </div>
            </div>

            {/* Customers & Providers links (2-column on mobile, separate grid cells on desktop) */}
            <div className="grid grid-cols-2 gap-6 sm:contents">
              <div>
                <h4 className="font-bold text-sm mb-5 text-gray-900 uppercase tracking-wide">
                  {t.footer.forCustomers}
                </h4>
                <ul className="space-y-3 text-sm">
                  {t.footer.customerLinks.map((item, idx) => {
                    const props = getCustomerLinkProps(idx);
                    return (
                      <li key={item}>
                        {props.isAction ? (
                          <button
                            type="button"
                            onClick={props.onClick}
                            className="text-gray-500 hover:text-blue-600 transition-colors duration-200 font-medium text-left cursor-pointer"
                          >
                            {item}
                          </button>
                        ) : (
                          <a
                            href={props.href}
                            className="text-gray-500 hover:text-blue-600 transition-colors duration-200 font-medium"
                          >
                            {item}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-sm mb-5 text-gray-900 uppercase tracking-wide">
                  {t.footer.forProviders}
                </h4>
                <ul className="space-y-3 text-sm">
                  {t.footer.providerLinks.map((item, idx) => {
                    const props = getProviderLinkProps(idx);
                    return (
                      <li key={item}>
                        {props.isRoute ? (
                          <Link
                            href={props.href!}
                            className="text-gray-500 hover:text-blue-600 transition-colors duration-200 font-medium"
                          >
                            {item}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={props.onClick}
                            className="text-gray-500 hover:text-blue-600 transition-colors duration-200 font-medium text-left cursor-pointer"
                          >
                            {item}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            {/* Contact info */}
            <div>
              <h4 className="font-bold text-sm mb-5 text-gray-900 uppercase tracking-wide">
                {t.footer.contact}
              </h4>
              <ul className="space-y-3.5 text-sm text-gray-500">
                <li className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                  <span>{t.footer.address}</span>
                </li>
                <li className="flex items-center gap-3">
                  <Phone className="w-4 h-4 flex-shrink-0 text-blue-500" />
                  <a
                    href="tel:+998712000000"
                    className="hover:text-blue-600 transition-colors font-medium"
                  >
                    +998 (71) 200-00-00
                  </a>
                </li>
                <li className="flex items-center gap-3">
                  <Mail className="w-4 h-4 flex-shrink-0 text-blue-500" />
                  <a
                    href="mailto:support@hormang.uz"
                    className="hover:text-blue-600 transition-colors font-medium"
                  >
                    support@hormang.uz
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom row */}
          <div className="border-t border-gray-200/80 pt-7 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
            <p>{t.footer.copyright}</p>
            <div className="flex gap-6">
              <button
                type="button"
                onClick={() => setLegalDoc("privacy")}
                className="hover:text-blue-600 transition-colors font-medium cursor-pointer"
              >
                {t.footer.privacy}
              </button>
              <button
                type="button"
                onClick={() => setLegalDoc("terms")}
                className="hover:text-blue-600 transition-colors font-medium cursor-pointer"
              >
                {t.footer.terms}
              </button>
            </div>
          </div>
        </div>
      </footer>

      <LegalModal
        type={legalDoc}
        open={Boolean(legalDoc)}
        onOpenChange={(open) => !open && setLegalDoc(null)}
      />
    </>
  );
}
