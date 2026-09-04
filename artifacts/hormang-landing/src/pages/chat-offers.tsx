/**
 * /chat-offers — Combined Offers + Chat History page
 * Shows all received offers (grouped by request) and recent chats.
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Clock, ChevronRight, Check, X,
  Inbox, LayoutList, ChevronLeft, CheckCircle2,
} from "lucide-react";
import { ImageStrip } from "@/components/image-grid";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/bottom-nav";
import {
  getOffersByCustomer, getChatsByCustomer, getRequestsByCustomer,
  updateOfferStatus,
  type Offer, type Chat, type CustomerRequest,
} from "@/lib/requests-store";
import { useAuth } from "@/contexts/auth-context";
import { OfferDetailModal } from "@/components/offer-detail-modal";
import { AcceptConfirmModal } from "@/components/accept-confirm-modal";
import { getLocalProfile } from "@/lib/local-profile";
import logoImg from "/hormang-logo.png";
import { formatDate as uzDate } from "@/lib/date-utils";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat } from "@/lib/i18n";
import { getCategoryDisplayName } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { getAvgResponseMinutes, formatAvgResponseTime } from "@/lib/response-time-store";
import { useStoreRefresh } from "@/hooks/use-store-refresh";

/* ─── Tab type ───────────────────────────────────────────────────── */
type Tab = "offers" | "chats";

/* ─── Helpers ─────────────────────────────────────────────────────── */
function formatDate(iso: string, months?: string[]): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString("uz-Latn-UZ", { hour: "2-digit", minute: "2-digit" });
  }
  return uzDate(iso, { months });
}

/* ─── Offer Card ─────────────────────────────────────────────────── */
function OfferCard({ offer, req, index, anyAccepted, onChanged }: {
  offer: Offer;
  req: CustomerRequest | undefined;
  index: number;
  anyAccepted: boolean;
  onChanged: () => void;
}) {
  useStoreRefresh();
  const { t, locale } = useI18n();
  const tt = t.chatOffersPage;
  const [showDetail, setShowDetail] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [, setLocation] = useLocation();

  const isAccepted  = offer.status === "accepted";
  const isInProgress = offer.status === "in_progress";
  const isRejected  = offer.status === "rejected";
  const isCompleted = offer.status === "completed";
  const providerLocal = getLocalProfile(offer.masterId);
  const providerPhoto = offer.masterPhotoUrl || providerLocal.photoUrl;

  function handleAcceptClick(e: React.MouseEvent) {
    e.stopPropagation();
    setShowConfirm(true);
  }

  async function confirmAccept() {
    await updateOfferStatus(offer.id, "accepted");
    setShowConfirm(false);
    onChanged();
  }

  async function reject(e: React.MouseEvent) {
    e.stopPropagation();
    await updateOfferStatus(offer.id, "rejected");
    onChanged();
  }

  // Can accept: offer is pending, and no other offer on this request is already accepted
  const canAccept = !isAccepted && !isRejected && !anyAccepted;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.35 }}
        onClick={() => setShowDetail(true)}
        className={`bg-white rounded-2xl border overflow-hidden transition-all duration-200 cursor-pointer ${
          isAccepted ? "border-emerald-200"
          : isRejected ? "border-gray-100 opacity-55"
          : anyAccepted ? "border-gray-100 opacity-60"
          : "border-gray-100 hover:border-blue-100 hover:shadow-md"
        }`}
      >
        {/* Request context strip */}
        {req && (
          <div className="px-4 pt-3 pb-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <CategoryIcon categoryId={req.categoryId} emoji={req.emoji} size={18} shape="square" className="flex-shrink-0" />
            <p className="text-xs font-semibold text-gray-500 flex-1 truncate">{getCategoryDisplayName(req.categoryId, locale, req.categoryName)}</p>
            <span className="text-[10px] text-gray-400">{formatDate(offer.createdAt, t.shared.months)}</span>
          </div>
        )}

        <div className="p-4">
          {/* Provider row */}
          <div className="flex items-start gap-3 mb-3">
            {providerPhoto ? (
              <img
                src={providerPhoto}
                alt={offer.masterName}
                className="w-11 h-11 rounded-2xl object-cover border border-gray-200 flex-shrink-0 shadow-sm"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm"
                style={{ background: offer.masterColor }}
              >
                {offer.masterInitials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-sm text-gray-900">{offer.masterName}</p>
                {isCompleted && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">
                    {tt.completed}
                  </span>
                )}
                {isInProgress && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">
                    {tt.scheduled}
                  </span>
                )}
                {!isCompleted && !isInProgress && isAccepted && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">
                    {tt.accepted}
                  </span>
                )}
                {isRejected && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {tt.rejected}
                  </span>
                )}
                {!isCompleted && !isInProgress && !isAccepted && !isRejected && anyAccepted && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                    {tt.otherAccepted}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3 text-gray-400" />
                <span className="text-[11px] text-gray-400 font-medium">
                  {formatAvgResponseTime(getAvgResponseMinutes(offer.masterId), t.shared.responseTime)}
                </span>
              </div>
            </div>
            {/* Price */}
            <div className="flex-shrink-0 text-right">
              <p className="font-extrabold text-base text-blue-600">{offer.price.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400">{tt.sumSuffix}</p>
            </div>
          </div>

          {/* Message preview */}
          <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-3">
            <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">{offer.message}</p>
          </div>

          {/* File / image strip */}
          {offer.fileUrls && offer.fileUrls.length > 0 && (
            <div className="mb-3">
              <ImageStrip urls={offer.fileUrls} max={4} />
            </div>
          )}

          {/* Actions */}
          {isCompleted ? (
            /* Completed: only Batafsil + Chat to review conversation */
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}
                className="flex-1 h-9 text-xs font-bold border-gray-200 text-gray-500 hover:bg-gray-50 gap-1.5"
              >
                {tt.detailsBtn}
              </Button>
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); setLocation(`/chat/${offer.requestId}_${offer.masterId}`); }}
                className="flex-1 h-9 text-xs font-bold bg-blue-600 hover:bg-blue-700 gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                {tt.chatBtn}
              </Button>
            </div>
          ) : !isRejected ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}
                className="flex-1 h-9 text-xs font-bold border-blue-200 text-blue-600 hover:bg-blue-50 gap-1.5"
              >
                {tt.detailsBtn}
              </Button>
              {isAccepted || isInProgress ? (
                <Button
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setLocation(`/chat/${offer.requestId}_${offer.masterId}`); }}
                  className="flex-1 h-9 text-xs font-bold bg-blue-600 hover:bg-blue-700 gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  {tt.chatBtn}
                </Button>
              ) : canAccept ? (
                <>
                  <Button
                    size="sm"
                    onClick={handleAcceptClick}
                    className="flex-1 h-9 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {tt.acceptBtn}
                  </Button>
                  <button
                    onClick={reject}
                    className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </motion.div>

      <AnimatePresence>
        {showDetail && (
          <OfferDetailModal offer={offer} onClose={() => setShowDetail(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showConfirm && (
          <AcceptConfirmModal
            onConfirm={confirmAccept}
            onCancel={() => setShowConfirm(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Chat Row ───────────────────────────────────────────────────── */
function ChatRow({ chat, offer, req, index }: { chat: Chat; offer: Offer | undefined; req: CustomerRequest | undefined; index: number }) {
  const { t, locale } = useI18n();
  const tt = t.chatOffersPage;
  const [, setLocation] = useLocation();
  const lastMsg = chat.messages[chat.messages.length - 1];
  const providerLocal = getLocalProfile(chat.masterId);
  const st = offer?.status ?? "pending";
  const unread = chat.customerUnread ?? 0;

  const customerWaiting = offer?.customerConfirmedCompleted && !offer?.providerConfirmedCompleted && st !== "completed";
  const needsCustomerConfirm = offer?.providerConfirmedCompleted && !offer?.customerConfirmedCompleted && st !== "completed";

  const badge =
    st === "completed"
      ? { label: tt.chatStatusCompleted, cls: "text-blue-600 bg-blue-50 border-blue-200", icon: <CheckCircle2 className="w-3 h-3" /> }
      : customerWaiting
      ? { label: tt.chatStatusWaitingProvider, cls: "text-amber-600 bg-amber-50 border-amber-200", icon: <Clock className="w-3 h-3" /> }
      : needsCustomerConfirm
      ? { label: tt.chatStatusConfirm, cls: "text-violet-600 bg-violet-50 border-violet-200", icon: <CheckCircle2 className="w-3 h-3" /> }
      : st === "in_progress"
      ? { label: tt.chatStatusScheduled, cls: "text-blue-600 bg-blue-50 border-blue-200", icon: <Clock className="w-3 h-3" /> }
      : st === "accepted"
      ? { label: tt.chatStatusAccepted, cls: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> }
      : st === "rejected"
      ? { label: tt.chatStatusRejected, cls: "text-red-500 bg-red-50 border-red-200", icon: <X className="w-3 h-3" /> }
      : { label: tt.chatStatusPending, cls: "text-amber-600 bg-amber-50 border-amber-200", icon: <Clock className="w-3 h-3" /> };

  const borderCls =
    st === "completed" || st === "in_progress" ? "border-blue-100 hover:border-blue-200" :
    st === "accepted" ? "border-emerald-100 hover:border-emerald-200" :
    st === "rejected" ? "border-red-100 hover:border-red-200" :
    "border-gray-100 hover:border-blue-100";

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      onClick={() => setLocation(`/chat/${chat.id}`)}
      className={`w-full bg-white rounded-2xl border p-4 flex items-start gap-3 hover:shadow-sm transition-all duration-200 text-left ${borderCls}`}
    >
      {providerLocal.photoUrl ? (
        <img
          src={providerLocal.photoUrl}
          alt={chat.masterName}
          className="w-11 h-11 rounded-2xl object-cover border border-gray-200 flex-shrink-0 shadow-sm"
        />
      ) : (
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm"
          style={{ background: chat.masterColor }}
        >
          {chat.masterInitials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className={`text-sm truncate ${unread > 0 ? "font-extrabold text-gray-900" : "font-bold text-gray-900"}`}>{chat.masterName}</p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {unread > 0 && (
              <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
            <span className="text-[10px] text-gray-400">
              {formatDate(lastMsg?.timestamp ?? chat.createdAt, t.shared.months)}
            </span>
          </div>
        </div>
        <p className="text-xs text-gray-500 font-medium truncate mb-1">{getCategoryDisplayName(req?.categoryId ?? "", locale, chat.categoryName)}</p>
        {offer && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold border px-1.5 py-0.5 rounded-full ${badge.cls}`}>
            {badge.icon}
            {badge.label}
          </span>
        )}
        {lastMsg && (
          <p className="text-[11px] text-gray-400 truncate mt-0.5">
            {lastMsg.sender === "system"
              ? (() => {
                  const sysMsgs = t.chatPage;
                  const map: Record<string, string> = {
                    "Taklif qabul qilindi — Suhbat davom etmoqda": sysMsgs.systemMsgOfferAccepted,
                    "Taklif rad etildi. Suhbat yopildi.": sysMsgs.systemMsgOfferRejected,
                    "Mijoz boshqa ijrochi taklifini qabul qildi": sysMsgs.systemMsgOfferSiblingClosed,
                    "⏳ Ijrochi xizmat yakunlanganligini tasdiqladi. Mijoz tasdig'i kutilmoqda.": sysMsgs.systemMsgProviderConfirmed,
                    "⏳ Mijoz xizmat yakunlanganligini tasdiqladi. Ijrochi tasdig'i kutilmoqda.": sysMsgs.systemMsgCustomerConfirmed,
                    "✅ Xizmat yakunlandi! Hamkorlik uchun rahmat.": sysMsgs.systemMsgCompleted,
                    "Предложение принято — чат продолжается": sysMsgs.systemMsgOfferAccepted,
                    "Предложение отклонено. Чат закрыт.": sysMsgs.systemMsgOfferRejected,
                    "Клиент принял предложение другого исполнителя": sysMsgs.systemMsgOfferSiblingClosed,
                    "⏳ Исполнитель подтвердил завершение. Ожидается подтверждение клиента.": sysMsgs.systemMsgProviderConfirmed,
                    "⏳ Клиент подтвердил завершение. Ожидается подтверждение исполнителя.": sysMsgs.systemMsgCustomerConfirmed,
                    "✅ Услуга завершена! Спасибо за сотрудничество.": sysMsgs.systemMsgCompleted,
                  };
                  return map[lastMsg.text] ?? lastMsg.text;
                })()
              : (lastMsg.sender === "customer" ? tt.youPrefix : "") + lastMsg.text}
          </p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
    </motion.button>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function ChatOffersPage() {
  const { t, locale } = useI18n();
  const tt = t.chatOffersPage;
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const rawSearch = useSearch();
  const params = new URLSearchParams(rawSearch);
  const filterRequestId = params.get("requestId") ?? undefined;

  const [tab, setTab] = useState<Tab>(
    () => (sessionStorage.getItem("chat_offers_tab") as Tab) ?? "offers"
  );

  function switchTab(t: Tab) {
    sessionStorage.setItem("chat_offers_tab", t);
    setTab(t);
  }

  const customerId = user?.id ?? "";
  const [allOffers, setAllOffers] = useState<Offer[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [requestById, setRequestById] = useState<Map<string, CustomerRequest>>(new Map());

  const load = useCallback(async () => {
    if (!customerId) return;
    try {
      const [offersRes, chatsRes, requestsRes] = await Promise.all([
        getOffersByCustomer(customerId), getChatsByCustomer(customerId), getRequestsByCustomer(customerId),
      ]);
      setAllOffers(offersRes);
      setChats(chatsRes);
      setRequestById(new Map(requestsRes.map((r) => [r.id, r])));
    } catch (err) {
      console.error("Load offers/chats failed:", err);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const offerByPair = new Map(allOffers.map((o) => [`${o.requestId}_${o.masterId}`, o]));

  const filtered = filterRequestId ? allOffers.filter((o) => o.requestId === filterRequestId) : allOffers;
  const offers = [...filtered].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Requests that already have one accepted offer — used to disable Accept on other cards
  const activeRequestIds = new Set(
    allOffers
      .filter((o) => o.status === "accepted" || o.status === "in_progress" || o.status === "completed")
      .map((o) => o.requestId)
  );

  const filteredReq = filterRequestId ? requestById.get(filterRequestId) : undefined;
  const pendingCount = offers.filter((o) => o.status === "pending").length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          {filterRequestId ? (
            <button
              onClick={() => setLocation("/my-requests")}
              className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={() => setLocation("/customer-home")} className="flex items-center flex-shrink-0">
              <img src={logoImg} alt="Hormang" className="w-8 h-8 object-contain" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-extrabold text-sm text-gray-900 truncate">
              {filteredReq
                ? `${filteredReq.emoji} ${getCategoryDisplayName(filteredReq.categoryId, locale, filteredReq.categoryName)}`
                : tt.headerTitle}
            </h1>
            <p className="text-xs text-gray-400">
              {pendingCount > 0 ? tFormat(tt.pendingCountTpl, { n: pendingCount }) : tFormat(tt.summaryTpl, { offers: offers.length, chats: chats.length })}
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="max-w-lg mx-auto px-4 pb-3 flex gap-2">
          <button
            onClick={() => switchTab("offers")}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              tab === "offers"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            {tt.tabOffers}
            {pendingCount > 0 && (
              <span className={`text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${
                tab === "offers" ? "bg-white text-blue-600" : "bg-blue-600 text-white"
              }`}>
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => switchTab("chats")}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              tab === "chats"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            {tt.tabChats}
            {chats.length > 0 && (
              <span className={`text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${
                tab === "chats" ? "bg-white text-blue-600" : "bg-gray-400 text-white"
              }`}>
                {chats.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5">
        <AnimatePresence mode="wait">
          {tab === "offers" ? (
            <motion.div
              key="offers"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
            >
              {offers.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <Inbox className="w-7 h-7 text-gray-400" />
                  </div>
                  <p className="font-bold text-gray-600 mb-1">{tt.emptyOffersTitle}</p>
                  <p className="text-sm text-gray-400">
                    {tt.emptyOffersDesc}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {offers.map((offer, i) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      req={requestById.get(offer.requestId)}
                      index={i}
                      onChanged={load}
                      anyAccepted={
                        offer.status !== "accepted" &&
                        offer.status !== "in_progress" &&
                        offer.status !== "completed" &&
                        activeRequestIds.has(offer.requestId)
                      }
                    />
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="chats"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {chats.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <MessageCircle className="w-7 h-7 text-gray-400" />
                  </div>
                  <p className="font-bold text-gray-600 mb-1">{tt.emptyChatsTitle}</p>
                  <p className="text-sm text-gray-400">
                    {tt.emptyChatsDesc}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {chats.map((chat, i) => (
                    <ChatRow key={chat.id} chat={chat} offer={offerByPair.get(`${chat.requestId}_${chat.masterId}`)} req={requestById.get(chat.requestId)} index={i} />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <BottomNav />
    </div>
  );
}
