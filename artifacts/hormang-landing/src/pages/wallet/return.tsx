/**
 * /wallet/return — Payme/Click redirect here after the hosted checkout page.
 * Polls the order until the webhook (PerformTransaction / Complete) has
 * confirmed payment server-side — which already credited the real wallet
 * and recorded the ledger row — then just refetches the real balance.
 */
import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Check, X, Clock } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { getWalletOrder, type WalletOrder, type WalletTier } from "@/lib/wallet-client";
import { refreshTangaBalance } from "@/lib/wallet-balance";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

type Status = "polling" | "success" | "failed" | "timeout";

export default function WalletReturnPage() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const orderId = new URLSearchParams(search).get("order_id");

  const [status, setStatus] = useState<Status>("polling");
  const [credited, setCredited] = useState<number | null>(null);

  useEffect(() => {
    if (!orderId || !user) {
      setStatus("failed");
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    async function poll() {
      if (cancelled) return;

      let result: { order: WalletOrder; tier: WalletTier };
      try {
        result = await getWalletOrder(orderId!);
      } catch {
        if (!cancelled) setStatus("failed");
        return;
      }

      const { order, tier } = result;

      if (order.status === "paid") {
        const total = tier.credits + tier.bonusTokens;
        await refreshTangaBalance(user!.id);
        if (!cancelled) {
          setCredited(total);
          setStatus("success");
        }
        return;
      }

      if (order.status === "cancelled" || order.status === "failed") {
        if (!cancelled) setStatus("failed");
        return;
      }

      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        if (!cancelled) setStatus("timeout");
        return;
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, user]);

  const tt = {
    polling: locale === "ru" ? "Платёж проверяется…" : "To'lov tekshirilmoqda…",
    success: locale === "ru" ? "Оплата прошла успешно!" : "To'lov muvaffaqiyatli o'tdi!",
    creditedTpl: (n: number) => (locale === "ru" ? `Начислено ${n} Tanga` : `${n} ta Tanga hisobingizga qo'shildi`),
    failed: locale === "ru" ? "Платёж не подтверждён" : "To'lov tasdiqlanmadi",
    timeout: locale === "ru" ? "Tasdiqlash cho'zilmoqda, birozdan so'ng qayta tekshiring" : "Tasdiqlash cho'zilmoqda, birozdan so'ng qayta tekshiring",
    backBtn: locale === "ru" ? "Вернуться к тарифам" : "Rejalarga qaytish",
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-sm w-full text-center">
        {status === "polling" && (
          <>
            <div className="w-14 h-14 rounded-full border-[3px] border-amber-400 border-t-transparent animate-spin mx-auto mb-4" />
            <p className="font-bold text-gray-700">{tt.polling}</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <p className="font-extrabold text-emerald-700 mb-1">{tt.success}</p>
            {credited !== null && <p className="text-sm text-gray-500">{tt.creditedTpl(credited)}</p>}
          </>
        )}
        {(status === "failed" || status === "timeout") && (
          <>
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              {status === "timeout" ? <Clock className="w-7 h-7 text-red-500" /> : <X className="w-7 h-7 text-red-500" />}
            </div>
            <p className="font-bold text-gray-700">{status === "timeout" ? tt.timeout : tt.failed}</p>
          </>
        )}
        <button
          onClick={() => setLocation("/plans")}
          className="mt-6 w-full h-11 rounded-xl font-bold text-sm text-white active:scale-[0.97] transition-[transform,filter,box-shadow] duration-150 ease-out"
          style={{ background: "linear-gradient(135deg, #f59e0b 0%, #92400e 100%)" }}
        >
          {tt.backBtn}
        </button>
      </div>
    </div>
  );
}
