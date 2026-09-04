/**
 * /chat/:chatId — One-on-one chat with a master.
 * Messages persist in the real backend (see requests-client.ts); this page
 * polls for updates every few seconds since there's no websocket push yet.
 * Tapping the master's avatar opens their public profile preview modal.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Send, Circle, CheckCircle2, X, Clock, Loader2, Flag, ImageIcon, Star, Check, CheckCheck, Trash2, EyeOff, Copy } from "lucide-react";
import { compressImage } from "@/lib/image-utils";
import { PublicProfilePreviewModal } from "@/components/public-profile-preview-modal";
import { ReviewModal, type ReviewSubmitData } from "@/components/review-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { BottomNav } from "@/components/bottom-nav";
import { ChatHeaderActionsMenu } from "@/components/chat-header-actions-menu";
import { ReportModal } from "@/components/report-modal";
import { OfferDetailModal } from "@/components/offer-detail-modal";
import { RequestPreviewModal } from "@/components/request-preview-modal";
import { getLocalProfile } from "@/lib/local-profile";
import { useAuth } from "@/contexts/auth-context";
import { formatDate } from "@/lib/date-utils";
import {
  getOrCreateChat, sendMessage, getOfferForChat, confirmCompletion,
  markCustomerChatRead, deleteMessageForEveryone, deleteMessageForMe,
  clearChatForCustomer, getRequestById,
  type Chat, type ChatMessage, type Offer, type CustomerRequest,
} from "@/lib/requests-store";
import { isBlockedBy } from "@/lib/report-store";
import { getAvgResponseMinutes, formatAvgResponseTime } from "@/lib/response-time-store";
import { addReview, hasReviewedRequest } from "@/lib/completion-store";
import { SUSPENDED_MESSAGE } from "@/lib/safety-store";
import { openChatSocket } from "@/lib/chat-socket";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat } from "@/lib/i18n";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("uz-Latn-UZ", { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string, today: string, yesterday: string, months: string[]): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return today;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return yesterday;
  return formatDate(iso, { months });
}

/* ─── Offer status badge ─────────────────────────────────────────── */
function OfferStatusBadge({ status }: { status: Offer["status"] }) {
  const { t } = useI18n();
  const tt = t.chatPage;
  if (status === "accepted") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" />
        {tt.statusAccepted}
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        <X className="w-3 h-3" />
        {tt.statusRejected}
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
        <Loader2 className="w-3 h-3 animate-spin" />
        {tt.statusInProgress}
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
        <Flag className="w-3 h-3" />
        {tt.statusCompleted}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3" />
      {tt.statusPending}
    </span>
  );
}

/* ─── Message Bubble ─────────────────────────────────────────────── */
const SYSTEM_MSG_KEYS = [
  "systemMsgOfferAccepted",
  "systemMsgOfferRejected",
  "systemMsgOfferSiblingClosed",
  "systemMsgProviderConfirmed",
  "systemMsgCustomerConfirmed",
  "systemMsgCompleted",
] as const;
type SystemMsgKey = (typeof SYSTEM_MSG_KEYS)[number];

function MessageBubble({
  msg, isFirst, currentUserId, onLongPress, selected,
  onDeleteForEveryone, onDeleteForMe, onCopy,
}: {
  msg: ChatMessage;
  isFirst: boolean;
  currentUserId: string;
  onLongPress?: () => void;
  selected?: boolean;
  onDeleteForEveryone?: () => void;
  onDeleteForMe?: () => void;
  onCopy?: () => void;
}) {
  const { t } = useI18n();
  const tt = t.chatPage;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [popupBelow, setPopupBelow] = useState(false);

  useEffect(() => {
    if (!selected) return;
    const el = bubbleRef.current;
    if (!el) return;
    const { top } = el.getBoundingClientRect();
    setPopupBelow(top < 140);
  }, [selected]);

  if (msg.sender === "system") {
    const knownTexts: Record<string, SystemMsgKey> = {
      "Taklif qabul qilindi — Suhbat davom etmoqda": "systemMsgOfferAccepted",
      "Taklif rad etildi. Suhbat yopildi.": "systemMsgOfferRejected",
      "Mijoz boshqa ijrochi taklifini qabul qildi": "systemMsgOfferSiblingClosed",
      "⏳ Ijrochi xizmat yakunlanganligini tasdiqladi. Mijoz tasdig'i kutilmoqda.": "systemMsgProviderConfirmed",
      "⏳ Mijoz xizmat yakunlanganligini tasdiqladi. Ijrochi tasdig'i kutilmoqda.": "systemMsgCustomerConfirmed",
      "✅ Xizmat yakunlandi! Hamkorlik uchun rahmat.": "systemMsgCompleted",
      "Предложение принято — чат продолжается": "systemMsgOfferAccepted",
      "Предложение отклонено. Чат закрыт.": "systemMsgOfferRejected",
      "Клиент принял предложение другого исполнителя": "systemMsgOfferSiblingClosed",
      "⏳ Исполнитель подтвердил завершение. Ожидается подтверждение клиента.": "systemMsgProviderConfirmed",
      "⏳ Клиент подтвердил завершение. Ожидается подтверждение исполнителя.": "systemMsgCustomerConfirmed",
      "✅ Услуга завершена! Спасибо за сотрудничество.": "systemMsgCompleted",
    };
    const key = knownTexts[msg.text];
    const displayText = key ? tt[key] : msg.text;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center my-2">
        <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
          {displayText}
        </span>
      </motion.div>
    );
  }

  // Hidden for this user via "delete for me"
  if (msg.deletedForUsers?.includes(currentUserId)) return null;

  const isCustomer = msg.sender === "customer";
  const isOwnMsg = isCustomer;
  const ageMs = Date.now() - new Date(msg.timestamp).getTime();
  const withinWindow = ageMs <= 5 * 60 * 1000;
  const canDeleteForEveryone = isOwnMsg && withinWindow && !msg.deletedForEveryone;

  function startPress() {
    if (!onLongPress) return;
    pressTimer.current = setTimeout(() => { onLongPress(); }, 400);
  }
  function endPress() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  return (
    <motion.div
      ref={bubbleRef}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isCustomer ? "justify-end" : "justify-start"} ${isFirst ? "" : "mt-1"} relative`}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
    >
      {selected && (
        <div className={`absolute ${popupBelow ? "top-full mt-1" : "-top-28"} z-30 flex flex-col bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden min-w-[168px] ${isCustomer ? "right-0" : "left-0"}`}>
          {canDeleteForEveryone && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onDeleteForEveryone?.(); }}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-red-500 text-xs font-semibold hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
              {tt.deleteForEveryone}
            </button>
          )}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDeleteForMe?.(); }}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 text-gray-600 text-xs font-semibold hover:bg-gray-50 transition-colors ${canDeleteForEveryone ? "border-t border-gray-100" : ""}`}
          >
            <EyeOff className="w-3.5 h-3.5 flex-shrink-0" />
            {tt.deleteForMe}
          </button>
          {msg.text && !msg.deletedForEveryone && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onCopy?.(); }}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-gray-600 text-xs font-semibold hover:bg-gray-50 transition-colors border-t border-gray-100"
            >
              <Copy className="w-3.5 h-3.5 flex-shrink-0" />
              {tt.copy}
            </button>
          )}
        </div>
      )}
      <div
        className={`max-w-[75%] rounded-2xl text-sm leading-relaxed overflow-hidden ${
          isCustomer
            ? "bg-blue-600 text-white rounded-br-md"
            : "bg-white text-gray-900 border border-gray-100 rounded-bl-md shadow-sm"
        }`}
      >
        {msg.deletedForEveryone ? (
          <div className="px-3.5 py-2.5">
            <p className={`italic text-xs ${isCustomer ? "text-blue-200" : "text-gray-400"}`}>{tt.messageDeleted}</p>
            <div className={`flex items-center justify-end mt-1 ${isCustomer ? "text-blue-200" : "text-gray-400"}`}>
              <span className="text-[10px]">{formatTime(msg.timestamp)}</span>
            </div>
          </div>
        ) : (
          <>
            {msg.attachment?.type === "image" && (
              <img src={msg.attachment.url} alt={msg.attachment.url}
                className="w-full max-w-[220px] object-cover rounded-t-2xl" style={{ display: "block" }} />
            )}
            <div className="px-3.5 py-2.5">
              {msg.text && <p style={{ whiteSpace: "pre-wrap" }}>{msg.text}</p>}
              <div className={`flex items-center justify-end gap-1 mt-1 ${isCustomer ? "text-blue-200" : "text-gray-400"}`}>
                <span className="text-[10px]">{formatTime(msg.timestamp)}</span>
                {isCustomer && (
                  msg.readAt
                    ? <CheckCheck className="w-3.5 h-3.5 text-sky-300" strokeWidth={2.5} />
                    : <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Day Separator ──────────────────────────────────────────────── */
function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-[11px] font-semibold text-gray-400">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function ChatPage() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/chat/:chatId");
  const chatId = params?.chatId ?? "";
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const tt = t.chatPage;

  const [requestId, masterId] = chatId.split("_");

  const [input, setInput] = useState("");
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [showMasterProfile, setShowMasterProfile] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  const [chat, setChat] = useState<Chat | undefined>(undefined);
  const [offer, setOffer] = useState<Offer | undefined>(undefined);
  const [request, setRequest] = useState<CustomerRequest | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  const loadChat = useCallback(async () => {
    if (!requestId || !masterId) { setLoaded(true); return; }
    try {
      const [c, o, r] = await Promise.all([
        getOrCreateChat(requestId, masterId),
        getOfferForChat(requestId, masterId),
        getRequestById(requestId),
      ]);
      setChat(c);
      setOffer(o);
      setRequest(r);
    } catch (err) {
      console.error("Load chat failed:", err);
    } finally {
      setLoaded(true);
    }
  }, [requestId, masterId]);

  useEffect(() => {
    loadChat();
    // Slow safety-net poll — covers the rare case the socket below drops
    // silently (mobile background, flaky network) without firing onclose.
    const interval = setInterval(loadChat, 20000);
    return () => clearInterval(interval);
  }, [loadChat]);

  /* Real-time push for the open thread. */
  useEffect(() => {
    if (!chat?.id) return;
    const socket = openChatSocket(chat.id, {
      onMessage: (message) => {
        setChat((prev) => {
          if (!prev || prev.messages.some((m) => m.id === message.id)) return prev;
          return { ...prev, messages: [...prev.messages, message] };
        });
      },
      onRead: (readAt) => {
        setChat((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.sender === "customer" && !m.readAt ? { ...m, readAt } : m,
            ),
          };
        });
      },
    });
    return () => socket.close();
  }, [chat?.id]);

  const masterLocal = chat?.masterId ? getLocalProfile(chat.masterId) : null;
  const masterPhotoUrl = offer?.masterPhotoUrl || masterLocal?.photoUrl;
  const isBlocked = !!(user && chat && (
    isBlockedBy(user.id, chat.masterId) || isBlockedBy(chat.masterId, user.id)
  ));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
  }, [chat?.messages.length]);

  /* Mark this chat as read for the customer whenever it's open AND new
   * messages from the provider arrive while the user is still viewing it. */
  useEffect(() => {
    if (chat?.id) markCustomerChatRead(chat.id);
  }, [chat?.id, chat?.customerUnread, chat?.messages.length]);

  /* Auto-prompt review when the OTHER side marks the offer completed.
   * Only triggers once per visit; user can re-open via the badge button. */
  useEffect(() => {
    if (
      offer?.status === "completed" &&
      user?.id &&
      chat &&
      !hasReviewedRequest(chat.requestId, user.id) &&
      !reviewDismissed
    ) {
      setShowReview(true);
    }
  }, [offer?.status]);

  if (!match || (loaded && !chat)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 font-semibold mb-4">{tt.notFound}</p>
          <button
            onClick={() => setLocation("/my-requests")}
            className="text-blue-600 font-bold text-sm"
          >
            {tt.backToRequests}
          </button>
        </div>
      </div>
    );
  }
  if (!chat) return null;

  async function handleSend() {
    if (!chat) return;
    if (!input.trim() && !attachPreview) return;
    if (user?.suspended) {
      toast({ title: SUSPENDED_MESSAGE, variant: "destructive" });
      return;
    }
    if (isBlocked) {
      toast({ title: tt.blockedCannotSend, variant: "destructive" });
      return;
    }
    const text = input.trim();
    const attachment = attachPreview ? { type: "image" as const, url: attachPreview } : undefined;
    setInput("");
    setAttachPreview(null);
    await sendMessage(chat.id, "customer", text, attachment);
    loadChat();
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await compressImage(file, 800, 0.72);
    setAttachPreview(url);
    e.target.value = "";
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleComplete() {
    if (!offer || !chat) return;
    if (user?.suspended) {
      toast({ title: SUSPENDED_MESSAGE, variant: "destructive" });
      return;
    }
    const result = await confirmCompletion(offer.id, "customer");
    if (result === "completed" && !hasReviewedRequest(chat.requestId, user?.id ?? "")) {
      setShowReview(true);
    }
    loadChat();
  }

  async function handleReviewSubmit(data: ReviewSubmitData) {
    if (!offer || !user || !chat) return;
    try {
      await addReview({
        requestId: chat.requestId,
        offerId: offer.id,
        reviewerId: user.id,
        reviewerRole: "customer",
        reviewedId: chat.masterId,
        reviewedRole: "provider",
        rating: data.rating,
        comment: data.text || undefined,
        photoUrl: data.photoUrl,
        platformSentiment: data.platformSentiment,
        platformFeedback: data.platformFeedback,
        providerMetrics: data.providerMetrics,
        reviewerName: chat.customerName,
        reviewerInitials: chat.customerInitials,
        reviewerColor: chat.customerColor,
        reviewedName: chat.masterName,
        serviceCategory: chat.categoryName ?? undefined,
      });
      setShowReview(false);
      setReviewDismissed(true);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : t.common.errorGeneric, variant: "destructive" });
    }
  }

  const visibleMessages = chat.messages.filter((m) => new Date(m.timestamp).getTime() > chat.customerClearedAt);

  const grouped: Array<{ day: string; messages: ChatMessage[] }> = [];
  for (const msg of visibleMessages) {
    const day = formatDay(msg.timestamp, tt.today, tt.yesterday, t.shared.months);
    const last = grouped[grouped.length - 1];
    if (last?.day === day) last.messages.push(msg);
    else grouped.push({ day, messages: [msg] });
  }
  const canComplete =
    offer &&
    chat &&
    (offer.status === "accepted" || offer.status === "in_progress") &&
    !offer.customerConfirmedCompleted;

  const customerWaiting =
    offer?.customerConfirmedCompleted &&
    !offer?.providerConfirmedCompleted &&
    offer?.status !== "completed";

  const alreadyCompleted = offer?.status === "completed";

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Chat Header */}
      <div className="bg-white border-b border-gray-100 shrink-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 flex-shrink-0 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Clickable master avatar */}
          <button
            onClick={() => setShowMasterProfile(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm active:scale-95 transition-transform ring-2 ring-transparent hover:ring-blue-300 overflow-hidden"
            style={masterPhotoUrl ? {} : { background: chat.masterColor }}
          >
            {masterPhotoUrl ? (
              <img
                src={masterPhotoUrl}
                alt={chat.masterName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              chat.masterInitials
            )}
          </button>

          <button
            onClick={() => setShowMasterProfile(true)}
            className="flex-1 min-w-0 text-left"
          >
            <p className="font-extrabold text-sm text-gray-900">{chat.masterName}</p>
            <div className="flex items-center gap-1.5">
              <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500 flex-shrink-0" />
              <p className="text-[11px] text-gray-400">
                {tFormat(tt.avgResponseTpl, {
                  n: formatAvgResponseTime(getAvgResponseMinutes(chat.masterId), t.shared.responseTime),
                })}
              </p>
            </div>
          </button>

          {/* Live offer status badge in header */}
          {offer && !canComplete && !alreadyCompleted && !customerWaiting && (
            <div className="flex-shrink-0">
              <OfferStatusBadge status={offer.status} />
            </div>
          )}

          {/* Waiting for provider confirmation */}
          {customerWaiting && (
            <div className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">
              <Clock className="w-3 h-3" />
              {tt.waitingProvider}
            </div>
          )}

          {/* Complete button */}
          {canComplete && (
            <button
              onClick={() => setShowCompleteConfirm(true)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold transition-colors active:scale-95"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {tt.completeBtn}
            </button>
          )}

          {/* Already completed: show review button if user hasn't rated yet */}
          {alreadyCompleted && (
            <div className="flex-shrink-0 flex items-center gap-2">
              {chat && user && !hasReviewedRequest(chat.requestId, user.id) && (
                <button
                  onClick={() => { setReviewDismissed(false); setShowReview(true); }}
                  className="w-7 h-7 rounded-xl bg-white-400 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-95 shadow-sm"
                    title={tt.rateTitle}
                  >
                    <Star className="w-5 h-5 text-amber-500" />
                </button>
              )}
              <OfferStatusBadge status="completed" />
            </div>
          )}
          <ChatHeaderActionsMenu
            otherUserId={chat.masterId}
            otherUserName={chat.masterName}
            onViewProfile={() => setShowMasterProfile(true)}
            onViewDetails={() => setShowDetails(true)}
            onReport={() => setShowReport(true)}
            onClearChat={() => setShowClearConfirm(true)}
          />
        </div>
      </div>

      {selectedMsgId && (
        <div className="fixed inset-0 z-20" onClick={() => setSelectedMsgId(null)} />
      )}

      {/* Messages area — scrolls internally, fills all remaining space */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-lg mx-auto w-full px-4 pt-4 pb-4">
          {grouped.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              {tt.noMessages}
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.day}>
              <DaySeparator label={group.day} />
              <div className="space-y-1">
                {group.messages.map((msg, i) => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    isFirst={i === 0 || group.messages[i - 1].sender !== msg.sender}
                    currentUserId={user?.id ?? ""}
                    onLongPress={msg.sender !== "system" ? () => setSelectedMsgId(msg.id) : undefined}
                    selected={selectedMsgId === msg.id}
                    onDeleteForEveryone={() => { deleteMessageForEveryone(chat.id, msg.id).then(loadChat); setSelectedMsgId(null); }}
                    onDeleteForMe={() => { deleteMessageForMe(chat.id, msg.id).then(loadChat); setSelectedMsgId(null); }}
                    onCopy={() => { navigator.clipboard.writeText(msg.text); setSelectedMsgId(null); }}
                  />
                ))}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} className="h-1" />
        </div>
      </div>

      {/* Input bar — in flow, sits above BottomNav */}
      <div className="shrink-0 bg-white border-t border-gray-100 z-20 pb-16">
        {attachPreview && (
          <div className="max-w-lg mx-auto px-4 pt-2">
            <div className="relative inline-block">
              <img src={attachPreview} alt="attachment" className="h-16 w-16 rounded-xl object-cover border border-gray-200" />
              <button
                onClick={() => setAttachPreview(null)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <input
            ref={attachInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          <button
            onClick={() => attachInputRef.current?.click()}
            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors flex-shrink-0"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={tt.inputPlaceholder}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() && !attachPreview}
            className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Master profile modal */}
      <AnimatePresence>
        {showMasterProfile && (
          <PublicProfilePreviewModal
            key={`chat-provider-${chat.masterId}`}
            mode="provider"
            providerData={{
              masterId: chat.masterId,
              masterName: chat.masterName,
              masterInitials: chat.masterInitials,
              masterColor: chat.masterColor,
              avgResponseTime: chat.avgResponseTime,
              categoryName: chat.categoryName,
              categoryEmoji: chat.categoryEmoji,
              photoUrl: masterPhotoUrl,
            }}
            onClose={() => setShowMasterProfile(false)}
          />
        )}
      </AnimatePresence>

      {/* Review modal */}
      <AnimatePresence>
        {showReview && offer && (
          <ReviewModal
            key="customer-review"
            subjectName={chat.masterName}
            subjectInitials={chat.masterInitials}
            subjectColor={chat.masterColor}
            subjectPhotoUrl={masterPhotoUrl}
            prompt={tt.rateProvider}
            showProviderSliders
            onSubmit={handleReviewSubmit}
            onSkip={() => setShowReview(false)}
          />
        )}
      </AnimatePresence>

      {/* Completion confirmation modal */}
      <AnimatePresence>
        {showCompleteConfirm && (
          <ConfirmModal
            key="customer-complete-confirm"
            title={tt.completeConfirmTitle}
            message={tt.completeConfirmMsg}
            confirmText={tt.completeConfirmYes}
            onConfirm={handleComplete}
            onClose={() => setShowCompleteConfirm(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showClearConfirm && (
          <ConfirmModal
            key="customer-clear-chat-confirm"
            title={tt.clearChatTitle}
            message={tt.clearChatMsg}
            confirmText={tt.clearChatYes}
            onConfirm={() => { clearChatForCustomer(chat.id).then(loadChat); setShowClearConfirm(false); setSelectedMsgId(null); }}
            onClose={() => setShowClearConfirm(false)}
          />
        )}
      </AnimatePresence>

      {/* Report user (from chat) — shares store + admin queue with PPP modal */}
      <AnimatePresence>
        {showReport && user && (
          <ReportModal
            key="customer-chat-report"
            reporterUserId={user.id}
            reportedUserId={chat.masterId}
            reportedName={chat.masterName}
            source="chat"
            chatId={chatId}
            lastMessageId={chat.messages[chat.messages.length - 1]?.id}
            onClose={() => setShowReport(false)}
          />
        )}
      </AnimatePresence>

      {/* Request / Offer details — reuses existing read-only modals */}
      <AnimatePresence>
        {showDetails && offer && (
          <OfferDetailModal
            key="customer-chat-offer-details"
            offer={offer}
            readOnly
            onClose={() => setShowDetails(false)}
          />
        )}
        {showDetails && !offer && request && (
          <RequestPreviewModal
            key="customer-chat-request-details"
            req={request}
            onClose={() => setShowDetails(false)}
          />
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
