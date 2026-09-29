import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";

import { motion, AnimatePresence } from "framer-motion";
import {
  Search, MessageCircle, ChevronRight, X, ChevronDown, SlidersHorizontal,
  Circle, Send, CheckCircle2, Clock, Loader2, Flag, CalendarPlus, CalendarCheck2, ImageIcon, Star, Check, CheckCheck, Trash2, EyeOff, Copy,
} from "lucide-react";
import { compressImage } from "@/lib/image-utils";
import { BottomNav } from "@/components/bottom-nav";
import {
  getProviderChats, markChatRead, sendProviderMessage, getProviderChatById,
  addUpcomingService, getUpcomingServices, getOffers,
  type ProviderChat, type ProviderChatMessage,
} from "@/lib/provider-store";
import {
  getOfferForChat, confirmCompletion, getRequestById,
  deleteMessageForEveryone, deleteMessageForMe,
  clearChatForProvider,
  type Offer, type CustomerRequest,
} from "@/lib/requests-store";
import { getAvgResponseMinutes, formatAvgResponseTime } from "@/lib/response-time-store";
import { addReview, hasReviewedRequest } from "@/lib/completion-store";
import { openChatSocket } from "@/lib/chat-socket";
import { ReviewModal, type ReviewSubmitData } from "@/components/review-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { CompletionModal } from "@/components/completion-modal";
import type { CompletionDetails } from "@/lib/requests-store";
import { ChatHeaderActionsMenu } from "@/components/chat-header-actions-menu";
import { ReportModal } from "@/components/report-modal";
import { OfferDetailModal } from "@/components/offer-detail-modal";
import { RequestPreviewModal } from "@/components/request-preview-modal";
import { isBlockedBy } from "@/lib/report-store";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import logoImg from "/hormang-logo.png";
import { PublicProfilePreviewModal } from "@/components/public-profile-preview-modal";
import { getLocalProfile } from "@/lib/local-profile";
import { formatDate } from "@/lib/date-utils";
import { useI18n } from "@/contexts/i18n-context";
import { getCategoryDisplayName } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { tFormat } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/locales/uz";
import { translateSystemMessage } from "@/lib/system-messages";

const VIOLET = "linear-gradient(135deg, hsl(262,80%,54%) 0%, hsl(236,76%,60%) 100%)";

function formatTime(iso: string, months: string[]): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString("uz-Latn-UZ", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return formatDate(iso, { months });
}

function formatDay(iso: string, t: Dict, months: string[]): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return t.providerChats.separators.today;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return t.providerChats.separators.yesterday;
  return formatDate(iso, { months });
}

function OfferStatusBadge({ status, t }: { status: Offer["status"]; t: Dict }) {
  if (status === "accepted") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" />
        {t.providerChats.badges.accepted}
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        <X className="w-3 h-3" />
        {t.providerChats.badges.rejected}
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
        <Loader2 className="w-3 h-3 animate-spin" />
        {t.providerChats.badges.inProgress}
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
        <Flag className="w-3 h-3" />
        {t.providerChats.badges.completed}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3" />
      {t.providerChats.badges.pending}
    </span>
  );
}


function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-[11px] font-semibold text-gray-400">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

function MsgBubble({
  msg, isFirst, currentUserId, onLongPress, selected,
  onDeleteForEveryone, onDeleteForMe, onCopy,
}: {
  msg: ProviderChatMessage;
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
    const displayText = translateSystemMessage(msg.text, tt);
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

  const isMe = msg.sender === "provider";
  const isOwnMsg = isMe;
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
      transition={{ duration: 0.18 }}
      className={`flex ${isMe ? "justify-end" : "justify-start"} ${isFirst ? "" : "mt-1"} relative`}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
    >
      {selected && (
        <div className={`absolute ${popupBelow ? "top-full mt-1" : "-top-28"} z-30 flex flex-col bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden min-w-[168px] ${isMe ? "right-0" : "left-0"}`}>
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
          isMe
            ? "text-white rounded-br-md shadow-sm"
            : "bg-white text-gray-900 border border-gray-100 rounded-bl-md shadow-sm"
        }`}
        style={isMe ? { background: VIOLET } : {}}
      >
        {msg.deletedForEveryone ? (
          <div className="px-3.5 py-2.5">
            <p className={`italic text-xs ${isMe ? "text-violet-200" : "text-gray-400"}`}>{tt.messageDeleted}</p>
            <div className={`flex items-center justify-end mt-1 ${isMe ? "text-violet-200" : "text-gray-400"}`}>
              <span className="text-[10px]">{formatTime(msg.timestamp, t.shared.months)}</span>
            </div>
          </div>
        ) : (
          <>
            {msg.attachment?.type === "image" && (
              <img src={msg.attachment.url} alt="rasm"
                className="w-full max-w-[220px] object-cover rounded-t-2xl" style={{ display: "block" }} />
            )}
            <div className="px-3.5 py-2.5">
              {msg.text && <p style={{ whiteSpace: "pre-wrap" }}>{msg.text}</p>}
              <div className={`flex items-center justify-end gap-1 mt-1 ${isMe ? "text-violet-200" : "text-gray-400"}`}>
                <span className="text-[10px]">{formatTime(msg.timestamp, t.shared.months)}</span>
                {isMe && (
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

interface ScheduleModalProps {
  onSave: (date: string, time: string, location: string) => void;
  onClose: () => void;
  defaultLocation?: string;
}
function ScheduleModal({ onSave, onClose, defaultLocation = "" }: ScheduleModalProps) {
  const { t } = useI18n();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [location, setLocation] = useState(defaultLocation);

  const today = new Date().toISOString().split("T")[0];

  function handleSave() {
    if (!date) return;
    onSave(date, time, location.trim() || t.providerChats.schedule.locationDash);
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60]"
        style={{ background: "rgba(10,10,30,0.55)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%", opacity: 0.7 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-[61] flex justify-center"
      >
        <div
          className="bg-white w-full max-w-lg rounded-t-3xl px-5 pb-8 pt-4"
          style={{ boxShadow: "0 -8px 40px rgba(0,0,0,0.14)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center mb-4">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <CalendarPlus className="w-4 h-4 text-violet-600" />
              <h3 className="font-extrabold text-gray-900 text-base">{t.providerChats.schedule.title}</h3>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3 mb-5">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">{t.providerChats.schedule.date}</label>
              <input
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-11 px-4 rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-all"
              />
            </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">{t.providerChats.schedule.time}</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full h-11 px-4 rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-all"
                  style={{ colorScheme: "light" }}
                />
              </div>

              <p className="text-sm text-gray-600 mt-1">
                {tFormat(t.providerChats.schedule.selectedTimeTpl, { time: "" })}
                <span className="font-mono font-bold text-gray-800">{time}</span>
              </p>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">{t.providerChats.schedule.location}</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t.providerChats.schedule.locationPlaceholder}
                  className="w-full h-11 px-4 rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-all"
                />
              </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-2xl border-2 border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
            >
              {t.providerChats.schedule.cancel}
            </button>
            <button
              onClick={handleSave}
              disabled={!date}
              className="flex-1 h-11 rounded-2xl text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              style={{ background: VIOLET }}
            >
              {t.providerChats.schedule.save}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

function ChatView({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [showCustomerProfile, setShowCustomerProfile] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const masterId = user?.id ?? "";

  const [chat, setChat] = useState<ProviderChat | null>(null);
  const [offer, setOffer] = useState<Offer | undefined>(undefined);
  const [request, setRequest] = useState<CustomerRequest | undefined>(undefined);

  const loadChat = useCallback(async () => {
    if (!chatId) return;
    try {
      const c = (await getProviderChatById(chatId)) ?? null;
      setChat(c);
      if (c) {
        const [o, r] = await Promise.all([getOfferForChat(c.requestId, c.masterId), getRequestById(c.requestId)]);
        setOffer(o);
        setRequest(r);
      }
    } catch (err) {
      console.error("Load provider chat failed:", err);
    }
  }, [chatId]);

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
          // ChatMessage uses sender "master"; ProviderChatMessage uses
          // "provider" — same mapping as chatToProviderChat() above.
          const mapped = { ...message, sender: message.sender === "master" ? ("provider" as const) : message.sender };
          return { ...prev, messages: [...prev.messages, mapped] };
        });
      },
      onRead: (readAt) => {
        setChat((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.sender === "provider" && !m.readAt ? { ...m, readAt } : m,
            ),
          };
        });
      },
    });
    return () => socket.close();
  }, [chat?.id]);

  /* Mark this chat as read for the provider on mount, on chatId change,
   * and whenever new customer messages arrive while the thread is open. */
  useEffect(() => {
    if (chatId) markChatRead(chatId);
  }, [chatId, chat?.unread, chat?.messages.length]);
  const isRejected = offer?.status === "rejected";
  const isCompleted = offer?.status === "completed";
  const canComplete =
    offer &&
    chat &&
    (offer.status === "accepted" || offer.status === "in_progress") &&
    !offer.providerConfirmedCompleted;

  const providerWaiting =
    offer?.providerConfirmedCompleted &&
    !offer?.customerConfirmedCompleted &&
    offer?.status !== "completed";
  const canSchedule =
    offer && (offer.status === "accepted" || offer.status === "in_progress") && !isCompleted;
  const isAlreadyPlanned =
    canSchedule && offer
      ? getUpcomingServices(masterId).some((s) => s.offerId === offer.id)
      : false;
  const customerLocal = chat?.customerId ? getLocalProfile(chat.customerId) : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [chat?.messages.length]);

  const alreadyCompleted = offer?.status === "completed";

  useEffect(() => {
    if (alreadyCompleted && masterId && chat && !hasReviewedRequest(chat.requestId, masterId) && !reviewDismissed) {
      setShowReview(true);
    }
  }, [alreadyCompleted]);

  const isBlocked = !!(user && chat && (
    isBlockedBy(user.id, chat.customerId) || isBlockedBy(chat.customerId, user.id)
  ));

  async function send() {
    if ((!text.trim() && !attachPreview) || isRejected || !chat) return;
    if (isBlocked) {
      toast({ title: t.chatPage.blockedCannotSend, variant: "destructive" });
      return;
    }
    const attachment = attachPreview ? { type: "image" as const, url: attachPreview } : undefined;
    setText("");
    setAttachPreview(null);
    await sendProviderMessage(chat.id, "provider", text.trim(), attachment);
    loadChat();
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await compressImage(file, 800, 0.72);
    setAttachPreview(url);
    e.target.value = "";
  }

  async function handleComplete(details: CompletionDetails) {
    if (!offer || !chat) return;
    const result = await confirmCompletion(offer.id, "provider", details);
    if (result === "completed" && !hasReviewedRequest(chat.requestId, masterId)) {
      setShowReview(true);
    }
    loadChat();
  }

  async function handleScheduleSave(date: string, time: string, location: string) {
    if (!chat || !offer) return;
    await addUpcomingService({
      offerId: offer.id,
      requestId: chat.requestId,
      masterId,
      customerId: chat.customerId,
      title: chat.categoryName,
      customerName: chat.customerName,
      customerInitials: chat.customerInitials,
      customerColor: chat.customerColor,
      date,
      time,
      location,
      categoryEmoji: chat.categoryEmoji,
    });
    setShowSchedule(false);
    // Upcoming-service scheduling stays local (no backend model for it yet),
    // so this announcement rides as a regular provider message rather than
    // a true system notice.
    await sendProviderMessage(chat.id, "provider", tFormat(t.providerChats.schedule.systemMsgTpl, { date, time }));
    loadChat();
  }

  async function handleReviewSubmit(data: ReviewSubmitData) {
    if (!offer || !chat) return;
    try {
      await addReview({
        requestId: chat.requestId,
        offerId: offer.id,
        reviewerId: masterId,
        reviewerRole: "provider",
        reviewedId: chat.customerId,
        reviewedRole: "customer",
        rating: data.rating,
        comment: data.text || undefined,
        photoUrl: data.photoUrl,
        platformSentiment: data.platformSentiment,
        platformFeedback: data.platformFeedback,
        reviewerName: offer.masterName,
        reviewerInitials: offer.masterInitials,
        reviewerColor: offer.masterColor,
        reviewedName: chat.customerName,
        serviceCategory: chat.categoryName,
      });
      setShowReview(false);
      setReviewDismissed(true);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : t.common.errorGeneric, variant: "destructive" });
    }
  }

  if (!chat) return null;

  const defaultLocation = [request?.district, request?.region].filter(Boolean).join(", ");

  const visibleMessages = chat.messages.filter((m) => new Date(m.timestamp).getTime() > chat.providerClearedAt);

  const grouped: Array<{ day: string; messages: ProviderChatMessage[] }> = [];
  for (const msg of visibleMessages) {
    const day = formatDay(msg.timestamp, t, t.shared.months);
    const last = grouped[grouped.length - 1];
    if (last?.day === day) last.messages.push(msg);
    else grouped.push({ day, messages: [msg] });
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
      className="fixed inset-x-0 top-0 bottom-14 bg-gray-50 z-40 flex flex-col"
    >
      <div className="bg-white border-b border-gray-100 shrink-0 z-10 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 flex-shrink-0 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowCustomerProfile(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm active:scale-95 transition-transform ring-2 ring-transparent hover:ring-violet-300 overflow-hidden"
            style={customerLocal?.photoUrl ? {} : { background: chat.customerColor }}
          >
            {customerLocal?.photoUrl ? (
              <img src={customerLocal.photoUrl} alt={chat.customerName} className="w-full h-full object-cover" />
            ) : (
              chat.customerInitials
            )}
          </button>

          <button
            onClick={() => setShowCustomerProfile(true)}
            className="flex-1 min-w-0 text-left"
          >
            <p className="font-extrabold text-sm text-gray-900 truncate">{chat.customerName}</p>
            <div className="flex items-center gap-1.5">
              <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500 flex-shrink-0" />
              <p className="text-[11px] text-gray-400">
                {tFormat(t.providerChats.header.avgResponseTpl, {
                  n: formatAvgResponseTime(
                    getAvgResponseMinutes(request?.customerId ?? ""),
                    t.shared.responseTime,
                  ),
                })}
              </p>
            </div>
          </button>

          {canComplete ? (
            <button
              onClick={() => setShowCompleteConfirm(true)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-[11px] font-bold transition-colors active:scale-95 shadow-sm"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t.providerChats.header.completed}
            </button>
          ) : providerWaiting ? (
            <div className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">
              <Clock className="w-3 h-3" />
              {t.providerChats.badges.customerWaiting}
            </div>
          ) : alreadyCompleted ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              {chat && masterId && !hasReviewedRequest(chat.requestId, masterId) && (
                <button
                  onClick={() => { setReviewDismissed(false); setShowReview(true); }}
                  className="w-7 h-7 rounded-xl bg-white-400 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-95 shadow-sm"
                  title={t.providerChats.header.review}
                >
                  <Star className="w-5 h-5 text-amber-500" />
                </button>
              )}
              <OfferStatusBadge status="completed" t={t} />
            </div>
          ) : offer ? (
            <div className="flex-shrink-0">
              <OfferStatusBadge status={offer.status} t={t} />
            </div>
          ) : null}
          <ChatHeaderActionsMenu
            otherUserId={chat.customerId}
            otherUserName={chat.customerName}
            onViewProfile={() => setShowCustomerProfile(true)}
            onViewDetails={() => setShowDetails(true)}
            onReport={() => setShowReport(true)}
            onClearChat={() => setShowClearConfirm(true)}
          />
        </div>
      </div>

      {selectedMsgId && (
        <div className="fixed inset-0 z-20" onClick={() => setSelectedMsgId(null)} />
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-lg mx-auto w-full px-4 pt-4 pb-4">
          {grouped.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              {t.providerChats.empty.noMessages}
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.day}>
              <DaySeparator label={group.day} />
              <div className="space-y-1">
                {group.messages.map((msg, i) => (
                  <MsgBubble
                    key={msg.id}
                    msg={msg}
                    isFirst={i === 0 || group.messages[i - 1].sender !== msg.sender}
                    currentUserId={masterId}
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

          {offer && offer.status !== "pending" &&
            !chat.messages.some(
              (m) =>
                m.sender === "system" &&
                (m.text.includes("qabul qilindi") || m.text.includes("rad etildi") ||
                 m.text.includes("принято") || m.text.includes("отклонено"))
            )}

          <div ref={bottomRef} className="h-1" />
        </div>
      </div>

      {isRejected ? (
        <div className="bg-red-50 border-t border-red-100">
          <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-center gap-2">
            <X className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-500">
              {t.providerChats.rejected}
            </p>
          </div>
        </div>
      ) : (
        <div className="shrink-0 bg-white border-t border-gray-100 z-20 pb-0">
          {attachPreview && (
            <div className="max-w-lg mx-auto px-4 pt-2">
              <div className="relative inline-block">
                <img src={attachPreview} alt={t.providerChats.input.attachAlt} className="h-16 w-16 rounded-xl object-cover border border-gray-200" />
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
            {canSchedule && (
              isAlreadyPlanned ? (
                <button
                  disabled
                  className="flex items-center gap-1.5 h-11 px-3 rounded-2xl border border-gray-200 bg-gray-50 text-gray-400 text-[11px] font-semibold flex-shrink-0 cursor-not-allowed opacity-60 select-none"
                  title={t.providerChats.schedule.plannedTitle}
                >
                  <CalendarCheck2 className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => setShowSchedule(true)}
                  className="w-11 h-11 rounded-2xl border-2 border-dashed border-violet-300 flex items-center justify-center text-violet-500 hover:bg-violet-50 transition-colors flex-shrink-0 active:scale-95"
                  title={t.providerChats.schedule.title}
                >
                  <CalendarPlus className="w-5 h-5" />
                </button>
              )
            )}
            <input
              ref={attachInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
            <button
              onClick={() => attachInputRef.current?.click()}
              disabled={isRejected}
              className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors flex-shrink-0 disabled:opacity-40"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder={t.providerChats.input.placeholder}
              className="flex-1 h-11 px-4 rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 transition-all"
            />
            <button
              onClick={send}
              disabled={!text.trim() && !attachPreview}
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
              style={{ background: VIOLET }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showCustomerProfile && (
          <PublicProfilePreviewModal
            key={`provider-chats-customer-${chat.customerId}`}
            mode="customer"
            customerData={{
              customerName: chat.customerName,
              customerInitials: chat.customerInitials,
              customerColor: chat.customerColor,
              customerId: chat.customerId,
              region: chat.region,
              district: chat.district,
            }}
            onClose={() => setShowCustomerProfile(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSchedule && (
          <ScheduleModal
            key="schedule-modal"
            defaultLocation={defaultLocation}
            onSave={handleScheduleSave}
            onClose={() => setShowSchedule(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReview && offer && (
          <ReviewModal
            key="provider-review"
            subjectName={chat.customerName}
            subjectInitials={chat.customerInitials}
            subjectColor={chat.customerColor}
            subjectPhotoUrl={customerLocal?.photoUrl}
            prompt={t.providerChats.review.prompt}
            onSubmit={handleReviewSubmit}
            onSkip={() => { setShowReview(false); setReviewDismissed(true); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCompleteConfirm && (
          <CompletionModal
            key="provider-chats-complete-modal"
            onConfirm={handleComplete}
            onClose={() => setShowCompleteConfirm(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showClearConfirm && (
          <ConfirmModal
            key="provider-clear-chat-confirm"
            title={t.chatPage.clearChatTitle}
            message={t.chatPage.clearChatMsg}
            confirmText={t.chatPage.clearChatYes}
            onConfirm={() => { clearChatForProvider(chat.id).then(loadChat); setShowClearConfirm(false); setSelectedMsgId(null); }}
            onClose={() => setShowClearConfirm(false)}
          />
        )}
      </AnimatePresence>

      {/* Report user (from chat) — shares store + admin queue with PPP modal */}
      <AnimatePresence>
        {showReport && user && chat && (
          <ReportModal
            key="provider-chat-report"
            reporterUserId={user.id}
            reportedUserId={chat.customerId}
            reportedName={chat.customerName}
            source="chat"
            chatId={chatId}
            lastMessageId={chat.messages[chat.messages.length - 1]?.id}
            onClose={() => setShowReport(false)}
          />
        )}
      </AnimatePresence>

      {/* Request / Offer details */}
      <AnimatePresence>
        {showDetails && offer && (
          <OfferDetailModal
            key="provider-chat-offer-details"
            offer={offer}
            readOnly
            onClose={() => setShowDetails(false)}
          />
        )}
        {showDetails && !offer && request && (
          <RequestPreviewModal
            key="provider-chat-request-details"
            req={request}
            onClose={() => setShowDetails(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ChatRow({ chat, offer, index, onClick, t }: { chat: ProviderChat; offer: Offer | undefined; index: number; onClick: () => void; t: Dict }) {
  const { locale } = useI18n();
  const lastMsg = chat.messages[chat.messages.length - 1];
  const customerLocal = chat.customerId ? getLocalProfile(chat.customerId) : null;
  const st = offer?.status ?? "pending";

  const borderCls =
    st === "accepted" ? "border-emerald-100 hover:border-emerald-200" :
    st === "rejected" ? "border-red-100 hover:border-red-200" :
    "border-gray-100 hover:border-violet-100";

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      onClick={onClick}
      className={`w-full bg-white rounded-2xl border p-4 flex items-start gap-3 hover:shadow-sm transition-all duration-200 text-left active:scale-[.99] ${borderCls}`}
    >
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm overflow-hidden"
        style={customerLocal?.photoUrl ? {} : { background: chat.customerColor }}
      >
        {customerLocal?.photoUrl ? (
          <img src={customerLocal.photoUrl} alt={chat.customerName} className="w-full h-full object-cover" />
        ) : (
          chat.customerInitials
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="font-bold text-sm text-gray-900 truncate">{chat.customerName}</p>
          <span className="text-[10px] text-gray-400 flex-shrink-0">
            {formatTime(lastMsg?.timestamp ?? chat.createdAt, t.shared.months)}
          </span>
        </div>
        <p className="text-xs text-gray-500 font-medium mb-1 inline-flex items-center gap-1">
          <CategoryIcon categoryId={chat.categoryId ?? null} emoji={chat.categoryEmoji} size={16} shape="square" />
          {getCategoryDisplayName(chat.categoryId ?? "", locale, chat.categoryName)}
        </p>
        {offer && (
          offer.providerConfirmedCompleted && !offer.customerConfirmedCompleted && offer.status !== "completed"
            ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                <Clock className="w-3 h-3" />
                {t.providerChats.badges.customerWaiting}
              </span>
            )
            : <OfferStatusBadge status={offer.status} t={t} />
        )}
        {lastMsg && (
          <p className="text-[11px] text-gray-400 truncate mt-0.5">
            {lastMsg.sender === "system"
              ? translateSystemMessage(lastMsg.text, t.chatPage)
              : (lastMsg.sender === "provider" ? t.providerChats.row.youPrefix : "") + lastMsg.text}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0 ml-1">
        {chat.unread > 0 ? (
          <span
            className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
            style={{ background: "hsl(262,80%,54%)" }}
          >
            {chat.unread}
          </span>
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-300" />
        )}
      </div>
    </motion.button>
  );
}

type SortTab = "all" | "unread";

export default function ProviderChatsPage() {
  const { t, locale } = useI18n();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<SortTab>("all");
  const [query, setQuery] = useState("");
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [activeCategoryFilters, setActiveCategoryFilters] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const { user } = useAuth();
  const masterId = user?.id ?? "";

  const [chats, setChats] = useState<ProviderChat[]>([]);
  const [offerByPair, setOfferByPair] = useState<Map<string, Offer>>(new Map());

  useEffect(() => {
    if (!masterId) return;
    let cancelled = false;
    (async () => {
      try {
        const [chatsRes, offersRes] = await Promise.all([getProviderChats(masterId), getOffers(masterId)]);
        if (cancelled) return;
        setChats(chatsRes);
        setOfferByPair(new Map(offersRes.map((o) => [`${o.requestId}_${o.masterId}`, o])));
      } catch (err) {
        console.error("Load provider chats failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [masterId]);

  const totalUnread = chats.reduce((s, c) => s + c.unread, 0);

  const allChatCategoryIds = Array.from(
    new Set(chats.map((c) => c.categoryId ?? c.categoryName).filter((id): id is string => Boolean(id)))
  );
  const filterableCategoryIds: string[] = allChatCategoryIds.length > 1 ? allChatCategoryIds : [];

  let displayed = chats;
  if (tab === "unread") displayed = chats.filter((c) => c.unread > 0);

  if (activeCategoryFilters.length > 0) {
    displayed = displayed.filter((c) => activeCategoryFilters.includes(c.categoryId ?? c.categoryName ?? ""));
  }

  if (query.trim()) {
    const q = query.toLowerCase();
    displayed = displayed.filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        getCategoryDisplayName(c.categoryId ?? "", locale, c.categoryName).toLowerCase().includes(q)
    );
  }

  function toggleCategoryFilter(catId: string) {
    setActiveCategoryFilters((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]
    );
  }

  function clearAllFilters() {
    setActiveCategoryFilters([]);
  }

  function toggleSearch() {
    if (searchExpanded) {
      setQuery("");
      setSearchExpanded(false);
    } else {
      setSearchExpanded(true);
      setFilterExpanded(false);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }

  function toggleFilter() {
    if (filterExpanded) {
      setFilterExpanded(false);
    } else {
      setFilterExpanded(true);
      setSearchExpanded(false);
      setQuery("");
    }
  }

  const tabs: Array<{ id: SortTab; label: string; count?: number }> = [
    { id: "all", label: t.providerChats.tabs.all, count: chats.length },
    { id: "unread", label: t.providerChats.tabs.unread, count: totalUnread || undefined },
  ];

  return (
    <div className={openChatId ? "h-screen overflow-hidden bg-gray-50" : "min-h-screen bg-gray-50 pb-24"}>
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-3">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setLocation("/provider-home")} className="flex items-center flex-shrink-0">
              <img src={logoImg} alt="Hormang" className="w-8 h-8 object-contain" />
            </button>
            <div className="flex-1">
              <h1 className="font-extrabold text-sm text-gray-900">{t.providerChats.title}</h1>
              <p className="text-xs text-gray-400">
                {totalUnread > 0
                  ? tFormat(t.providerChats.unreadCountTpl, { n: totalUnread })
                  : tFormat(t.providerChats.totalCountTpl, { n: chats.length })}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {tabs.map((tt) => (
              <button
                key={tt.id}
                onClick={() => setTab(tt.id)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                  tab === tt.id
                    ? "text-white shadow-sm"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
                style={tab === tt.id ? { background: VIOLET } : {}}
              >
                {tt.label}
                {tt.count !== undefined && tt.count > 0 && (
                  <span className={`text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${
                    tab === tt.id ? "bg-white text-violet-700" : "bg-violet-500 text-white"
                  }`}>
                    {tt.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-3 pb-4">
        {/* ── Compact toolbar: Filter + Search ── */}
        <div className="mb-3">
          <div className="flex items-center gap-2">

            {/* Filter button */}
            {filterableCategoryIds.length > 0 && (
              <button
                onClick={toggleFilter}
                className={`relative flex-shrink-0 w-7 h-7 rounded-full border flex items-center justify-center transition-all shadow-sm ${
                  filterExpanded || activeCategoryFilters.length > 0
                    ? "bg-violet-600 border-violet-600 text-white"
                    : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {activeCategoryFilters.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white border border-violet-200 text-violet-700 text-[9px] font-extrabold flex items-center justify-center shadow-sm">
                    {activeCategoryFilters.length}
                  </span>
                )}
              </button>
            )}

            {/* Search button / expanded field */}
            <motion.div layout className="flex items-center flex-1 min-w-0">
              <AnimatePresence mode="wait" initial={false}>
                {searchExpanded ? (
                  <motion.div
                    key="search-field"
                    initial={{ opacity: 0, width: 40 }}
                    animate={{ opacity: 1, width: "100%" }}
                    exit={{ opacity: 0, width: 40 }}
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                    className="relative w-full"
                  >
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onBlur={() => { if (!query) setSearchExpanded(false); }}
                      onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); setSearchExpanded(false); } }}
                      placeholder={t.providerChats.searchPlaceholder}
                      className="w-full h-7 pl-9 pr-9 rounded-full bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 transition-all shadow-sm"
                    />
                    {query && (
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setQuery(""); setSearchExpanded(false); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-300 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </motion.div>
                ) : (
                  <motion.button
                    key="search-btn"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={toggleSearch}
                    className={`flex-shrink-0 w-7 h-7 rounded-full border flex items-center justify-center transition-all shadow-sm ${
                      query
                        ? "bg-violet-600 border-violet-600 text-white"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Active filter pills */}
            {activeCategoryFilters.length > 0 && !filterExpanded && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-shrink min-w-0">
                {activeCategoryFilters.map((catId) => (
                  <span
                    key={catId}
                    className="inline-flex items-center gap-1 flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
                    style={{ background: "linear-gradient(135deg,hsl(262,80%,54%),hsl(236,76%,60%))" }}
                  >
                    {getCategoryDisplayName(catId, locale)}
                    <button
                      onClick={() => toggleCategoryFilter(catId)}
                      className="w-3.5 h-3.5 rounded-full bg-white/25 flex items-center justify-center hover:bg-white/40 transition-colors"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={clearAllFilters}
                  className="flex-shrink-0 text-[11px] font-bold text-gray-400 hover:text-gray-600 transition-colors ml-0.5"
                >
                  {locale === "uz" ? "Tozalash" : "Сбросить"}
                </button>
              </div>
            )}
          </div>

          {/* Expanded filter chips row */}
          <AnimatePresence>
            {filterExpanded && filterableCategoryIds.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-1.5 pt-2 pb-0.5 overflow-x-auto no-scrollbar">
                  <button
                    onClick={clearAllFilters}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                      activeCategoryFilters.length === 0
                        ? "text-white border-transparent shadow-sm"
                        : "bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200"
                    }`}
                    style={activeCategoryFilters.length === 0 ? { background: "linear-gradient(135deg,hsl(262,80%,54%),hsl(236,76%,60%))" } : {}}
                  >
                    {t.providerChats.tabs.all}
                  </button>
                  {filterableCategoryIds.map((catId) => {
                    const active = activeCategoryFilters.includes(catId);
                    return (
                      <button
                        key={catId}
                        onClick={() => toggleCategoryFilter(catId)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                          active
                            ? "text-white border-transparent shadow-sm"
                            : "bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200"
                        }`}
                        style={active ? { background: "linear-gradient(135deg,hsl(262,80%,54%),hsl(236,76%,60%))" } : {}}
                      >
                        {getCategoryDisplayName(catId, locale)}
                      </button>
                    );
                  })}
                  {activeCategoryFilters.length > 0 && (
                    <button
                      onClick={() => { clearAllFilters(); setFilterExpanded(false); }}
                      className="flex-shrink-0 text-[11px] font-bold text-gray-400 hover:text-red-500 transition-colors ml-1"
                    >
                      X
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {displayed.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <MessageCircle className="w-7 h-7 text-gray-400" />
            </div>
            <p className="font-bold text-gray-600 mb-1">{t.providerChats.empty.none}</p>
            <p className="text-sm text-gray-400">
              {tab === "unread" ? t.providerChats.empty.noUnread : t.providerChats.empty.noChats}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map((chat, i) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                offer={offerByPair.get(`${chat.requestId}_${chat.masterId}`)}
                index={i}
                onClick={() => setOpenChatId(chat.id)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {openChatId && (
          <ChatView
            key={openChatId}
            chatId={openChatId}
            onClose={() => setOpenChatId(null)}
          />
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
