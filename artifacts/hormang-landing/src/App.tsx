import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { I18nProvider } from "@/contexts/i18n-context";
import { migrateOnce } from "@/lib/migration";
import { refreshCategoriesCache } from "@/lib/categories";
import { refreshQuestionsCache } from "@/lib/questionnaire-store";
import { refreshAnnouncementsCache } from "@/lib/announcements-store";
import { refreshBadgesCache } from "@/lib/badge-store";

migrateOnce();
void refreshCategoriesCache().then(() => refreshQuestionsCache());
void refreshAnnouncementsCache();
void refreshBadgesCache();
import { captureReferralFromUrl } from "@/lib/referral-store";
captureReferralFromUrl();
import { CookieConsentBanner } from "@/components/cookie-banner";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import RoleSelectPage from "@/pages/auth/role-select";
import LoginPage from "@/pages/auth/login";
import RegisterPage from "@/pages/auth/register";
import UnifiedDashboard from "@/pages/dashboard/index";
import ProfileSettingsPage from "@/pages/profile/settings";
import ProviderProfilePage from "@/pages/providers/profile";
import QuestionnairePage from "@/pages/questionnaire";
import AdminQuestionsPage from "@/pages/admin/questions";
import AdminDashboard from "@/pages/admin/index";
import MyRequestsPage from "@/pages/my-requests";
import RequestHistoryPage from "@/pages/request-history";
import OffersPage from "@/pages/offers";
import ChatPage from "@/pages/chat";
import ChatOffersPage from "@/pages/chat-offers";
import SettingsPage from "@/pages/settings";
import NotificationsSettingsPage from "@/pages/settings/notifications";
import SecuritySettingsPage from "@/pages/settings/security";
import HelpSettingsPage from "@/pages/settings/help";
import AboutSettingsPage from "@/pages/settings/about";
import MigratePage from "@/pages/auth/migrate";
import ProviderHomePage from "@/pages/provider/home";
import ProviderRequestsPage from "@/pages/provider/requests";
import ProviderChatsPage from "@/pages/provider/chats";
import ProviderReviewsPage from "@/pages/provider-reviews";
import CustomerReviewsPage from "@/pages/customer-reviews";
import PlansPage from "@/pages/plans";
import WalletReturnPage from "@/pages/wallet/return";
import TangaHistoryPage from "@/pages/provider/tanga-history";
import ProviderHistoryPage from "@/pages/provider/history";
import ProviderHistoryDetailPage from "@/pages/provider/history-detail";
import CustomerHomePage from "@/pages/customer-home";
import FeedbackPage from "@/pages/feedback";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
    </div>
  );
}

function PublicOnlyRoute({ component: Component }: { component: React.FC }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user) setLocation("/dashboard");
  }, [loading, user]);

  if (loading) return <Spinner />;
  if (user) return <Spinner />;

  return <Component />;
}

function ProtectedRoute({ component: Component }: { component: React.FC }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) setLocation("/auth/login");
  }, [loading, user]);

  if (loading) return <Spinner />;
  if (!user) return <Spinner />;

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/auth/role">
        {() => <PublicOnlyRoute component={RoleSelectPage} />}
      </Route>
      <Route path="/auth/login">
        {() => <PublicOnlyRoute component={LoginPage} />}
      </Route>
      <Route path="/auth/register" component={RegisterPage} />
      <Route path="/auth/migrate">
        {() => <PublicOnlyRoute component={MigratePage} />}
      </Route>
      <Route path="/customer-home">
        {() => <ProtectedRoute component={CustomerHomePage} />}
      </Route>
      <Route path="/dashboard">
        {() => <ProtectedRoute component={UnifiedDashboard} />}
      </Route>
      <Route path="/dashboard/buyer">
        {() => <ProtectedRoute component={UnifiedDashboard} />}
      </Route>
      <Route path="/dashboard/provider">
        {() => <ProtectedRoute component={UnifiedDashboard} />}
      </Route>
      <Route path="/profile/settings">
        {() => <ProtectedRoute component={ProfileSettingsPage} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={SettingsPage} />}
      </Route>
      <Route path="/settings/notifications">
        {() => <ProtectedRoute component={NotificationsSettingsPage} />}
      </Route>
      <Route path="/settings/security">
        {() => <ProtectedRoute component={SecuritySettingsPage} />}
      </Route>
      <Route path="/settings/help">
        {() => <ProtectedRoute component={HelpSettingsPage} />}
      </Route>
      <Route path="/settings/about">
        {() => <ProtectedRoute component={AboutSettingsPage} />}
      </Route>
      <Route path="/providers/:id" component={ProviderProfilePage} />
      <Route path="/provider">
        {() => {
          window.location.replace("/provider/");
          return null;
        }}
      </Route>
      <Route path="/provider/">
        {() => {
          window.location.replace("/provider/");
          return null;
        }}
      </Route>
      <Route path="/questionnaire" component={QuestionnairePage} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/questions" component={AdminQuestionsPage} />
      <Route path="/my-requests">
        {() => <ProtectedRoute component={MyRequestsPage} />}
      </Route>
      <Route path="/request-history">
        {() => <ProtectedRoute component={RequestHistoryPage} />}
      </Route>
      <Route path="/offers">
        {() => <ProtectedRoute component={OffersPage} />}
      </Route>
      <Route path="/chat/:chatId">
        {() => <ProtectedRoute component={ChatPage} />}
      </Route>
      <Route path="/chat-offers">
        {() => <ProtectedRoute component={ChatOffersPage} />}
      </Route>
      <Route path="/provider-home">
        {() => <ProtectedRoute component={ProviderHomePage} />}
      </Route>
      <Route path="/provider/requests">
        {() => <ProtectedRoute component={ProviderRequestsPage} />}
      </Route>
      <Route path="/provider/chats">
        {() => <ProtectedRoute component={ProviderChatsPage} />}
      </Route>
      <Route path="/provider-reviews">
        {() => <ProtectedRoute component={ProviderReviewsPage} />}
      </Route>
      <Route path="/customer-reviews">
        {() => <ProtectedRoute component={CustomerReviewsPage} />}
      </Route>
      <Route path="/plans">
        {() => <ProtectedRoute component={PlansPage} />}
      </Route>
      <Route path="/wallet/return">
        {() => <ProtectedRoute component={WalletReturnPage} />}
      </Route>
      <Route path="/provider/tanga-history">
        {() => <ProtectedRoute component={TangaHistoryPage} />}
      </Route>
      <Route path="/provider/history">
        {() => <ProtectedRoute component={ProviderHistoryPage} />}
      </Route>
      <Route path="/provider/history/:id">
        {() => <ProtectedRoute component={ProviderHistoryDetailPage} />}
      </Route>
      <Route path="/feedback">
        {() => <ProtectedRoute component={FeedbackPage} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}


function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AuthProvider>
                <Router />
                <CookieConsentBanner />
              </AuthProvider>
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
