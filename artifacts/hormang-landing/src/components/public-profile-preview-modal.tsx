/**
 * PublicProfilePreviewModal — Redesigned unified public profile bottom-sheet.
 *
 * mode="provider"  → circular avatar, role badge, metrics row, bio, categories, portfolio.
 * mode="customer"  → circular avatar, role badge, metrics row, location.
 *
 * Pure UI redesign — same data-fetching logic as PublicProfileModal.
 * Phone number is NEVER shown.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, MapPin, ShieldCheck, Star,
  Briefcase, Award, ChevronRight, Flag,
  IdCard, Ban, LockOpen,
} from "lucide-react";
import { getLocalProfile, getServiceAreaLabels, getLiveProviderName } from "@/lib/local-profile";
import { getCategoryDisplayName } from "@/lib/categories";
import { getAverageRatingForUser, getReviewsForUser, getCompletedCount } from "@/lib/completion-store";
import { getAvgResponseMinutes, formatAvgResponseTime } from "@/lib/response-time-store";
import { isBlockedBy, blockUser, unblockUser } from "@/lib/report-store";
import { useStoreRefresh } from "@/hooks/use-store-refresh";
import { useToast } from "@/hooks/use-toast";
import { StarRating } from "@/components/star-rating";
import { ProviderReviewsSheet } from "@/components/provider-reviews-sheet";
import { CustomerReviewsSheet } from "@/components/customer-reviews-sheet";
import { ImageGrid } from "@/components/image-grid";
import { ReportModal } from "@/components/report-modal";
import { BadgePill, BadgeConditionsSheet } from "@/components/provider-badges";
import { getBadges } from "@/lib/badge-store";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat } from "@/lib/i18n";
import { getPublicPortfolio, type PublicPortfolioProject } from "@/lib/service-history-store";
import { PortfolioDetailModal } from "@/components/portfolio-detail-modal";
import { CategoryIcon } from "@/components/category-icon";
import { formatDate } from "@/lib/date-utils";

/* ─── Prop types (unified — formerly in public-profile-modal) ─────────── */
export interface ProviderProfileData {
  masterId: string;
  masterName: string;
  masterInitials: string;
  masterColor: string;
  avgResponseTime?: number;
  categoryName?: string;
  categoryEmoji?: string;
  photoUrl?: string;
}

export interface CustomerProfileData {
  customerName: string;
  customerInitials?: string;
  customerColor?: string;
  /**
   * Preferred: pass the customer's userId so the sheet can auto-load
   * their photo from localStorage (mirrors what ProviderSheet does with masterId).
   */
  customerId?: string;
  /** Explicit photo override — used when customerId is not available. */
  photoUrl?: string;
  region?: string;
  district?: string;
  joinedAt?: string;
  categoryName?: string;
  categoryEmoji?: string;
}

export interface PublicProfileModalProps {
  mode: "provider" | "customer";
  providerData?: ProviderProfileData;
  customerData?: CustomerProfileData;
  onClose: () => void;
}

/* ─── Theme ──────────────────────────────────────────────────────────── */
const VIOLET       = "hsl(262,80%,54%)";
const VIOLET_LIGHT = "hsl(262,80%,97%)";
const BLUE         = "hsl(221,78%,48%)";
const BLUE_LIGHT   = "hsl(221,78%,97%)";
const WHITE        = "hsl(0,0%,100%)";
const TRANSPARENT  = "transparent"
const BLUR         = "blur(10px)"

/* ─── Helpers ────────────────────────────────────────────────────────── */
function deriveInitials(name: string): string {
  return name.split(" ").map((p) => p[0] ?? "").join("").toUpperCase().slice(0, 2) || "??";
}

/* ─── Metric cell ────────────────────────────────────────────────────── */
function MetricCell({
  icon: Icon,
  topNode,
  value,
  label,
  color,
  onClick,
}: {
  icon?: React.FC<{ className?: string; style?: React.CSSProperties }>;
  topNode?: React.ReactNode;
  value: React.ReactNode;
  label: string;
  color: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      {topNode ?? (Icon ? <Icon className="w-3.5 h-3.5 mb-0.5" style={{ color }} /> : null)}
      <span className="text-sm font-black text-gray-900 leading-none">{value}</span>
      <span className="text-[10px] text-gray-400 font-medium text-center leading-tight">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="flex-1 flex flex-col items-center gap-0.5 px-2 cursor-pointer hover:opacity-80 active:opacity-60 transition-opacity underline"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center gap-0.5 px-2">
      {inner}
    </div>
  );
}

/* ─── Category chip ──────────────────────────────────────────────────── */
function CategoryChip({ label }: { label: string }) {
  return (
    <span
      className="text-[11px] font-bold px-3 py-1 rounded-full border"
      style={{
        color: VIOLET,
        background: VIOLET_LIGHT,
        borderColor: "hsl(262,80%,88%)",
      }}
    >
      {label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PROVIDER PREVIEW SHEET
   ═══════════════════════════════════════════════════════════════════════ */
function ProviderPreviewSheet({
  data,
  onClose,
}: {
  data: ProviderProfileData;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { toast } = useToast();
  useStoreRefresh();
  const tt = t.publicProfilePreviewModal;
  const local = getLocalProfile(data.masterId);
  const photoUrl = data.photoUrl || local.photoUrl;
  // Prefer the provider's current name — whatever the caller passed in
  // `data.masterName` may be a snapshot frozen at offer/chat creation time.
  const liveMasterName = getLiveProviderName(data.masterId) ?? data.masterName;
  const albums = local.albums ?? [];
  const allPhotos = albums.flatMap((a) => a.photos.map((p) => p.url));
  const bio = local.bio;
  const categories = local.categories ?? [];
  const serviceAreas = getServiceAreaLabels(local, {
    allToshkentCity:   tt.allToshkentCity,
    allToshkentRegion: tt.allToshkentRegion,
  });

  const avgRating = getAverageRatingForUser(data.masterId, "provider");
  const reviewCount = getReviewsForUser(data.masterId, "provider").length;
  const completedCount = getCompletedCount(data.masterId, "provider");

  const [showReviews, setShowReviews] = useState(false);
  const [showReport, setShowReport]   = useState(false);
  const [showBadgeHint, setShowBadgeHint] = useState(false);
  const pBadges = getBadges(data.masterId);

  const publicPortfolio = getPublicPortfolio(data.masterId);
  const [selectedProject, setSelectedProject] = useState<PublicPortfolioProject | null>(null);

  const canReport = user && user.id !== data.masterId;
  const blocked = user && user.id !== data.masterId ? isBlockedBy(user.id, data.masterId) : false;
  function handleToggleBlock() {
    if (!user) return;
    if (blocked) {
      unblockUser(user.id, data.masterId);
      toast({ title: t.chatPage.unblockedToast.replace("{{name}}", liveMasterName) });
    } else {
      blockUser(user.id, data.masterId);
      toast({ title: t.chatPage.blockedToast.replace("{{name}}", liveMasterName) });
    }
  }

  return (
    <>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60]"
        style={{ background: "rgba(15,10,30,0.65)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%", opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-[61] flex justify-center"
      >
        <div
          className="bg-white w-full max-w-lg rounded-t-[28px] overflow-hidden flex flex-col"
          style={{ maxHeight: "92dvh", boxShadow: "0 -8px 48px rgba(0,0,0,0.18)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Drag handle ── */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          {/* ── Close + Report + Block buttons ── */}
          <div className="flex items-center justify-between px-4 flex-shrink-0">
            {canReport ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowReport(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 text-gray-500 hover:bg-amber-50 hover:text-amber-600 transition-colors text-xs font-semibold"
                >
                  <Flag className="w-3.5 h-3.5" />
                  {tt.reportBtn}
                </button>
                <button
                  onClick={handleToggleBlock}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors text-xs font-semibold ${
                    blocked
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-gray-100 text-gray-500 hover:bg-rose-50 hover:text-rose-600"
                  }`}
                >
                  {blocked ? <LockOpen className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                  {blocked ? tt.unblockBtn : tt.blockBtn}
                </button>
              </div>
            ) : <div />}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
            {/* Hero: avatar + name + badge */}
            
            <div className="flex flex-col items-center text-center mb-4">
              {/* Avatar */}
              <div className="relative mb-2">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={liveMasterName}
                    className="w-32 h-32 rounded-full object-cover"
                    style={{
                      border: `3px solid ${VIOLET}`,
                      boxShadow: `0 0 0 6px hsl(262,80%,93%), 0 8px 28px rgba(139,92,246,0.22)`,
                    }}
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div
                    className="w-32 h-32 rounded-full flex items-center justify-center font-black text-white text-4xl"
                    style={{
                      background: `linear-gradient(135deg, ${data.masterColor}, hsl(236,76%,60%))`,
                      border: "3px solid white",
                      boxShadow: `0 0 0 6px hsl(262,80%,93%), 0 8px 28px rgba(139,92,246,0.22)`,
                    }}
                  >
                    {data.masterInitials}
                  </div>
                )}
                {/* Verified badge */}
                <div
                  className="
                    absolute bottom-0 right-0
                    w-8 h-8
                    rounded-full
                    flex items-center justify-center
                    bg-white
                    border-2 border-white
                    shadow-md
                  "
                  title={tt.verifiedTooltip}
                >
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100">
                    <IdCard className="w-4.5 h-4.5 text-gray-400" />
                  </div>  
                </div>
              </div>

              {/* Name */}
              <h2 className="text-2xl font-black text-gray-900 leading-tight mb-2">
                {liveMasterName}
              </h2>

              {/* Role + experience badges */}
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <span
                  className="text-xs font-black px-3 py-1 rounded-full text-white"
                  style={{ background: `linear-gradient(135deg, ${VIOLET}, hsl(236,76%,60%))` }}
                >
                  {tt.providerBadge}
                </span>
                {local.experience !== undefined && local.experience > 0 && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full text-violet-700 bg-violet-50 border border-violet-200">
                    <Award className="w-3 h-3 inline mr-1 -mt-0.5" />
                    {tFormat(tt.yearsExpTpl, { n: local.experience })}
                  </span>
                )}
              </div>
            </div>  
          {/* ── Scrollable body ── */}
          <div className="overflow-y-auto flex-1 px-5 pb-6">

          

            {/* ── Metrics row: Rating | Completed services | Verified ── */}
            <div
              className="flex items-center rounded-2xl border border-gray-100 py-4 mb-5"
              style={{ background: "hsl(262,80%,99%)" }}
            >
              <MetricCell
                topNode={<StarRating rating={avgRating > 0 ? avgRating : 0} size="w-3 h-3" />}
                value={avgRating > 0 ? avgRating.toFixed(1) : <span className="text-gray-400">—</span>}
                label={reviewCount > 0 ? tFormat(tt.reviewsCountTpl, { n: reviewCount }) : tt.notRated}
                color="hsl(37,95%,55%)"
                onClick={reviewCount > 0 ? () => setShowReviews(true) : undefined}
              />
              <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
              <MetricCell
                icon={Briefcase}
                value={tFormat(tt.completedShort, { n: completedCount })}
                label={tt.completedLabel}
                color="hsl(160,60%,40%)"
              />
              <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
              <div className="flex-1 flex flex-col items-center gap-1 px-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setShowBadgeHint(true)}
                  className="group flex flex-col items-center gap-1 rounded-xl hover:bg-violet-50/60 transition-colors py-1 w-full"
                  title={tt.badgeHintTitle}
                >
                  {pBadges.length > 0 ? (
                    pBadges.length <= 2 ? (
                      <div className="flex flex-wrap justify-center gap-1 max-w-[120px]">
                        {pBadges.map((b) => (
                          <BadgePill key={b.type} type={b.type} size="sm" />
                        ))}
                      </div>
                    ) : (
                      <div className="relative h-[52px] overflow-hidden">
                        <div className="badge-scroll-track flex flex-col gap-1">
                          {[...pBadges, ...pBadges].map((b, idx) => (
                            <BadgePill key={`${b.type}-${idx}`} type={b.type} size="sm" />
                          ))}
                        </div>
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-white to-transparent" />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-white to-transparent" />
                      </div>
                    )
                  ) : (
                    <Award className="w-3.5 h-3.5 text-gray-300" />
                  )}
                </button>
              </div>
            </div>

            <BadgeConditionsSheet open={showBadgeHint} onClose={() => setShowBadgeHint(false)} />

            {/* ── Average response time ── */}
            <div className="flex items-center justify-between mb-4 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">
                {t.chatPage.avgResponseTpl.split("{{n}}")[0].replace(/[:：]\s*$/, "")}
              </span>
              <span className="text-sm font-extrabold text-blue-900">
                {formatAvgResponseTime(getAvgResponseMinutes(data.masterId), t.shared.responseTime)}
              </span>
            </div>

            {/* ── Service areas / Location ── */}
            {serviceAreas.length > 0 && (
              <div className="flex items-start gap-2.5 mb-4">
                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: VIOLET_LIGHT }}
                >
                  <MapPin className="w-3.5 h-3.5" style={{ color: VIOLET }} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-1">
                    {tt.serviceAreasLabel}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {serviceAreas.map((area) => (
                      <span
                        key={area}
                        className="text-xs font-semibold text-gray-700 bg-gray-100 rounded-lg px-2.5 py-1"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Bio ── */}
            {bio && (
              <div
                className="rounded-2xl p-4 mb-4 border border-violet-100"
                style={{ background: VIOLET_LIGHT }}
              >
                <p className="text-[10px] text-violet-500 font-bold uppercase tracking-wide mb-1.5">
                  {tt.bioLabel}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">{bio}</p>
              </div>
            )}

            {/* ── Categories ── */}
            {categories.length > 0 && (
              <div className="mb-5">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-2">
                  {tt.serviceTypesLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <CategoryChip key={cat} label={getCategoryDisplayName(cat, locale)} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Portfolio (completed work + uploaded albums) ── */}
            {(publicPortfolio.length > 0 || albums.length > 0) && (
              <div className="mb-5 space-y-3">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">{tt.portfolioLabel}</p>

                {/* Completed-work projects (sanitized — no customer data) */}
                {publicPortfolio.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {publicPortfolio.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => setSelectedProject(project)}
                        className="text-left rounded-2xl border border-gray-100 overflow-hidden hover:border-violet-200 hover:shadow-sm transition-all active:scale-[.98]"
                      >
                        <div className="aspect-square bg-gray-100 relative">
                          {project.coverPhoto ? (
                            <img
                              src={project.coverPhoto}
                              alt={project.title}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <CategoryIcon categoryId={project.categoryId} emoji={project.emoji} size={48} shape="square" />
                            </div>
                          )}
                          {project.featured && (
                            <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-fuchsia-600 text-white">
                              <Award className="w-2.5 h-2.5" />
                              {t.providerProfilePage.portfolioFeatured}
                            </span>
                          )}
                          {typeof project.rating === "number" && (
                            <span className="absolute bottom-2 right-2 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black/60 text-white">
                              <Star className="w-2.5 h-2.5 fill-amber-300 text-amber-300" />
                              {project.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="p-2.5">
                          <p className="font-bold text-xs text-gray-900 truncate">{project.title}</p>
                          <p className="text-[10px] text-violet-600 font-semibold truncate mt-0.5">
                            {getCategoryDisplayName(project.categoryId, locale, project.categoryName)}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {formatDate(project.completedAt, { months: t.shared.months })}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Uploaded gallery albums */}
                {albums.length > 0 && (
                  <div className="space-y-3">
                    {albums.map((album) => (
                      <div key={album.id}>
                        <p className="text-xs font-semibold text-gray-700 mb-1.5">
                          {album.title} <span className="text-gray-400 font-normal">{tFormat(tt.portfolioAlbumCountTpl, { n: album.photos.length })}</span>
                        </p>
                        <ImageGrid
                          urls={album.photos.map((p) => p.url)}
                          maxVisible={6}
                          columns={3}
                          compact
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Privacy note ── */}
            <p className="text-center text-[11px] text-gray-400 leading-relaxed mb-2">
              {tt.privacyNote}
            </p>

           
          </div>
        </div>
      </motion.div>

      {/* ── Provider reviews sheet ── */}
      <AnimatePresence>
        {showReviews && (
          <ProviderReviewsSheet
            key="provider-reviews-sheet"
            providerId={data.masterId}
            providerName={liveMasterName}
            onClose={() => setShowReviews(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Report modal ── */}
      <AnimatePresence>
        {showReport && user && (
          <ReportModal
            key="provider-report-modal"
            reporterUserId={user.id}
            reportedUserId={data.masterId}
            reportedName={liveMasterName}
            onClose={() => setShowReport(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Portfolio project detail ── */}
      <AnimatePresence>
        {selectedProject && (
          <PortfolioDetailModal
            key="ppp-portfolio-detail"
            project={selectedProject}
            onClose={() => setSelectedProject(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CUSTOMER PREVIEW SHEET
   ═══════════════════════════════════════════════════════════════════════ */
function CustomerPreviewSheet({
  data,
  onClose,
}: {
  data: CustomerProfileData;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  useStoreRefresh();
  const tt = t.publicProfilePreviewModal;
  const name     = data.customerName?.trim() || tt.fallbackCustomer;
  const initials = data.customerInitials ?? deriveInitials(name);
  const color    = data.customerColor ?? BLUE;
  const location = data.district
    ? `${data.district}, ${data.region}`
    : data.region ?? "";

  const customerLocal = data.customerId ? getLocalProfile(data.customerId) : null;
  const photoUrl = customerLocal?.photoUrl ?? data.photoUrl;
  const custAvgRating = data.customerId ? getAverageRatingForUser(data.customerId, "customer") : 0;
  const custReviewCount = data.customerId ? getReviewsForUser(data.customerId, "customer").length : 0;
  const custCompletedCount = data.customerId ? getCompletedCount(data.customerId, "customer") : 0;
  const [showReviews, setShowReviews] = useState(false);
  const [showReport,  setShowReport]  = useState(false);

  const canReport = user && data.customerId && user.id !== data.customerId;
  const blocked = user && data.customerId && user.id !== data.customerId
    ? isBlockedBy(user.id, data.customerId)
    : false;
  function handleToggleBlock() {
    if (!user || !data.customerId) return;
    if (blocked) {
      unblockUser(user.id, data.customerId);
      toast({ title: t.chatPage.unblockedToast.replace("{{name}}", name) });
    } else {
      blockUser(user.id, data.customerId);
      toast({ title: t.chatPage.blockedToast.replace("{{name}}", name) });
    }
  }

  return (
    <>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60]"
        style={{ background: "rgba(10,15,35,0.65)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%", opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-[61] flex justify-center"
      >
        <div
          className="bg-white w-full max-w-lg rounded-t-[28px] overflow-hidden flex flex-col"
          style={{ maxHeight: "82dvh", boxShadow: "0 -8px 48px rgba(0,0,0,0.18)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          {/* Close + Report + Block */}
          <div className="flex items-center justify-between px-4 pb-1 flex-shrink-0">
            {canReport ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowReport(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 text-gray-500 hover:bg-amber-50 hover:text-amber-600 transition-colors text-xs font-semibold"
                >
                  <Flag className="w-3.5 h-3.5" />
                  {tt.reportBtn}
                </button>
                <button
                  onClick={handleToggleBlock}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors text-xs font-semibold ${
                    blocked
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-gray-100 text-gray-500 hover:bg-rose-50 hover:text-rose-600"
                  }`}
                >
                  {blocked ? <LockOpen className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                  {blocked ? tt.unblockBtn : tt.blockBtn}
                </button>
              </div>
            ) : <div />}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          

            {/* Hero */}
            <div className="flex flex-col items-center text-center mb-4">
              {/* Avatar */}
              <div className="relative mb-2">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={name}
                    className="w-32 h-32 rounded-full object-cover"
                    style={{
                      border: `3px solid ${BLUE}`,
                      boxShadow: `0 0 0 6px hsl(221,78%,93%), 0 8px 28px rgba(59,130,246,0.22)`,
                    }}
                  />
                ) : (
                  <div
                    className="w-32 h-32 rounded-full flex items-center justify-center font-black text-white text-4xl"
                    style={{
                      background: `linear-gradient(135deg, ${color}, hsl(199,89%,56%))`,
                      border: "3px solid white",
                      boxShadow: `0 0 0 6px hsl(221,78%,93%), 0 8px 28px rgba(59,130,246,0.22)`,
                    }}
                  >
                    {initials}
                  </div>
                )}
              </div>

              {/* Name */}
              <h2 className="text-2xl font-black text-gray-900 leading-tight mb-2">{name}</h2>

              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <span
                  className="text-xs font-black px-3 py-1 rounded-full text-white"
                  style={{ background: `linear-gradient(135deg, ${BLUE}, hsl(199,89%,56%))` }}
                >
                  {tt.customerBadge}
                </span>
              </div>
            </div>
{/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-5 pb-6">
            {/* ── Metrics row ── */}
            <div
              className="flex items-center rounded-2xl border border-gray-100 py-4 mb-5"
              style={{ background: BLUE_LIGHT }}
            >
              <MetricCell
                topNode={<StarRating rating={custAvgRating > 0 ? custAvgRating : 0} size="w-3 h-3" />}
                value={custAvgRating > 0 ? custAvgRating.toFixed(1) : <span className="text-gray-400">—</span>}
                label={custReviewCount > 0 ? tFormat(tt.reviewsCountTpl, { n: custReviewCount }) : tt.notRated}
                color="hsl(37,95%,55%)"
                onClick={custReviewCount > 0 && data.customerId ? () => setShowReviews(true) : undefined}
              />
              <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
              <MetricCell
                icon={Briefcase}
                value={tFormat(tt.completedShort, { n: custCompletedCount })}
                label={tt.completedRequestsLabel}
                color={BLUE}
              />
              <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
              <MetricCell
                icon={ShieldCheck}
                value="✓"
                label={tt.verifiedLabel}
                color="hsl(160,60%,40%)"
              />
            </div>

            {/* ── Average response time ── */}
            {data.customerId && (
              <div className="flex items-center justify-between mb-4 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
                <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">
                  {t.chatPage.avgResponseTpl.split("{{n}}")[0].replace(/[:：]\s*$/, "")}
                </span>
                <span className="text-sm font-extrabold text-blue-900">
                  {formatAvgResponseTime(getAvgResponseMinutes(data.customerId), t.shared.responseTime)}
                </span>
              </div>
            )}

            {/* ── Customer "under review" badge (admin-only warning, shown if present) ── */}
            {data.customerId && (() => {
              const custBadges = getBadges(data.customerId);
              if (custBadges.length === 0) return null;
              return (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {custBadges.map((b) => <BadgePill key={b.type} type={b.type} size="md" />)}
                </div>
              );
            })()}

            {/* ── Location ── */}
            {location && (
              <div className="flex items-start gap-2.5 mb-5">
                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: BLUE_LIGHT }}
                >
                  <MapPin className="w-3.5 h-3.5" style={{ color: BLUE }} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">
                    {tt.homeAddressLabel}
                  </p>
                  <p className="text-sm font-bold text-gray-800">{location}</p>
                </div>
              </div>
            )}

            

            {/* ── Privacy note ── */}
            <p className="text-center text-[11px] text-gray-400 leading-relaxed mb-4">
              {tt.privacyNote}
            </p>

            
          </div>
        </div>
      </motion.div>

      {/* ── Customer reviews sheet ── */}
      <AnimatePresence>
        {showReviews && data.customerId && (
          <CustomerReviewsSheet
            key="customer-reviews-sheet"
            customerId={data.customerId}
            customerName={name}
            onClose={() => setShowReviews(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Report modal ── */}
      <AnimatePresence>
        {showReport && user && data.customerId && (
          <ReportModal
            key="customer-report-modal"
            reporterUserId={user.id}
            reportedUserId={data.customerId}
            reportedName={name}
            onClose={() => setShowReport(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Unified export — same prop shape as PublicProfileModal (drop-in ready)
   ═══════════════════════════════════════════════════════════════════════ */
export function PublicProfilePreviewModal({
  mode,
  providerData,
  customerData,
  onClose,
}: PublicProfileModalProps) {
  if (mode === "provider" && providerData) {
    return <ProviderPreviewSheet data={providerData} onClose={onClose} />;
  }
  if (mode === "customer" && customerData) {
    return <CustomerPreviewSheet data={customerData} onClose={onClose} />;
  }
  return null;
}
