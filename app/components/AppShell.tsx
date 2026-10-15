import { ReactNode, Suspense, lazy, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  ClipboardList,
  CalendarDays,
  CreditCard,
  Users,
  HardHat,
  ShieldCheck,
  UserRound,
  Zap,
  Settings as SettingsIcon,
  LogOut,
  FileText,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "../helpers/useAuth";
import { useMe } from "../helpers/useMe";
import { opsFormat } from "../helpers/opsFormat";
import { postCrmPull } from "../endpoints/crm/pull_POST.schema";
import { postPaySync } from "../endpoints/payments/sync_POST.schema";
import { AuthLoadingState } from "./AuthLoadingState";
import { Button } from "./Button";
import type { BillingSummary } from "../helpers/plans";
import { saveReturnTo, peekReturnTo, clearReturnTo } from "../helpers/returnTo";
import { enablePush, isNativeApp } from "../helpers/nativeApp";
import { DeleteAccountButton } from "./DeleteAccountButton";
import { useInboxThreads } from "../helpers/useInbox";

// Only signed-out visitors see the marketing page; keep it out of the app's first download.
const LandingPage = lazy(() => import("./LandingPage").then((m) => ({ default: m.LandingPage })));
import styles from "./AppShell.module.css";

const ADMIN_NAV = [
  { to: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { to: "/quotes", label: "Quotes", icon: FileText, match: (p: string) => p.startsWith("/quotes") },
  { to: "/jobs", label: "Jobs", icon: ClipboardList, match: (p: string) => p.startsWith("/jobs") },
  { to: "/schedule", label: "Schedule", icon: CalendarDays, match: (p: string) => p.startsWith("/schedule") },
  { to: "/payments", label: "Payments", icon: CreditCard, match: (p: string) => p.startsWith("/payments") },
  { to: "/clients", label: "Clients", icon: Users, match: (p: string) => p.startsWith("/clients") },
  { to: "/crew", label: "Crew", icon: HardHat, match: (p: string) => p.startsWith("/crew") },
];
const CREW_NAV = [
  { to: "/field", label: "My Jobs", icon: ShieldCheck, match: (p: string) => p === "/field" || p.startsWith("/jobs") },
  { to: "/schedule", label: "Schedule", icon: CalendarDays, match: (p: string) => p.startsWith("/schedule") },
  { to: "/field/profile", label: "Profile", icon: UserRound, match: (p: string) => p.startsWith("/field/profile") },
];
const ADMIN_ONLY = ["/payments", "/clients", "/crew", "/settings", "/quotes"];
const INBOX_NAV = { to: "/inbox", label: "Inbox", icon: MessageSquare, match: (p: string) => p.startsWith("/inbox") };
const SETTINGS_NAV = { to: "/settings", label: "Settings", icon: SettingsIcon, match: (p: string) => p.startsWith("/settings") };
// Detail and form pages read best in a narrower centred column on wide screens.
const NARROW = /^\/(clients|crew)\/.+|^\/quotes\/.+|^\/settings\/(?!form|integrations).+|^\/field\/profile/;
// Job detail and the main settings page go two-column on big screens, so they get a medium-width column.
const MEDIUM = /^\/jobs\/.+|^\/settings\/?$|^\/settings\/(form|integrations)/;

// Trial ending, subscription problems and job-limit warnings, for owners and office admins.
function BillingBanner({ billing: b }: { billing: BillingSummary }) {
  const days = b.trialEndsAt ? Math.max(0, Math.ceil((new Date(b.trialEndsAt).getTime() - Date.now()) / 86_400_000)) : 0;
  let msg: string | null = null;
  let tone = styles.bannerInfo;
  if (b.status === "expired") {
    msg = "Your free trial has ended. The app is read-only until you choose a plan.";
    tone = styles.bannerBad;
  } else if (b.status === "past_due") {
    msg = "Your last subscription payment failed. Update your card to keep access.";
    tone = styles.bannerBad;
  } else if (b.jobsThisMonth >= b.jobLimit) {
    msg = `You've used all ${b.jobLimit} scheduled jobs for this month.`;
    tone = styles.bannerBad;
  } else if (b.jobsThisMonth >= b.jobLimit * 0.8) {
    msg = `${b.jobsThisMonth} of ${b.jobLimit} scheduled jobs used this month.`;
    tone = styles.bannerWarn;
  } else if (b.status === "trial" && days <= 5) {
    msg = `${days} day${days === 1 ? "" : "s"} left in your free trial.`;
  }
  if (!msg) return null;
  return (
    <Link to="/settings/billing" className={`${styles.banner} ${tone}`}>
      <span>{msg}</span>
      <b>{b.status === "trial" || b.status === "expired" ? "Choose a plan" : b.status === "past_due" ? "Fix billing" : "Upgrade"} →</b>
    </Link>
  );
}

// Signed-in app frame. Signed-out visitors go to /login; the console (admin or crew)
// follows the user's role in their business.
export function AppShell({ children, className }: { children: ReactNode; className?: string }) {
  const { logout } = useAuth();
  const { data: me, error, isLoading, authState } = useMe();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const crew = me?.role === "crew";
  const qc = useQueryClient();
  // Unread client texts for the Inbox badge (office only; quiet until SMS Gateway is set up).
  const inbox = useInboxThreads({ enabled: !!me && me.role !== "crew" && me.onboarded });

  // Android app: register this phone for alerts once signed in (asks for permission the first time).
  const meId = me?.userId;
  useEffect(() => {
    if (meId && isNativeApp()) enablePush();
  }, [meId]);

  // Office view: check LeadConnector for new leads when the app opens and every few minutes
  // (the server throttles this and skips it when sync isn't set up).
  useEffect(() => {
    if (!me || crew) return;
    const check = () => {
      postCrmPull({})
        .then((r) => {
          if (r.imported) qc.invalidateQueries({ queryKey: ["ops"] });
        })
        .catch(() => undefined);
      // Pick up Square / direct debit payments even when webhooks aren't set up.
      postPaySync({})
        .then((r) => {
          if (r.updated) qc.invalidateQueries({ queryKey: ["ops"] });
        })
        .catch(() => undefined);
    };
    // Let the screen's own data load first; these are background checks.
    const first = setTimeout(check, 4000);
    const t = setInterval(check, 3 * 60 * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [me?.businessId, crew, qc]);

  useEffect(() => {
    if (crew && (pathname === "/" || ADMIN_ONLY.some((p) => pathname.startsWith(p)))) {
      navigate("/field", { replace: true });
    }
    if (me && !crew && pathname.startsWith("/field")) navigate("/", { replace: true });
  }, [crew, me, pathname, navigate]);

  useEffect(() => {
    if (authState.type === "authenticated" && peekReturnTo() === pathname + window.location.search + window.location.hash) clearReturnTo();
  }, [authState.type, pathname]);

  if (authState.type === "loading") return <AuthLoadingState title="Signing you in" />;
  if (authState.type === "unauthenticated") {
    // Signed-out web visitors to the home page see the marketing page; the installed
    // mobile app (and every other page) goes straight to sign-in.
    if (pathname === "/" && !isNativeApp()) {
      return (
        <Suspense fallback={<AuthLoadingState title="Loading" />}>
          <LandingPage />
        </Suspense>
      );
    }
    saveReturnTo(pathname + window.location.search + window.location.hash);
    return <Navigate to="/login" replace />;
  }
  if (isLoading) return <AuthLoadingState title="Loading your business" />;
  if (error || !me) {
    return (
      <div className={styles.stage}>
        <div className={styles.orphan}>
          <h1>No business linked</h1>
          <p>{error instanceof Error ? error.message : "Your login isn't linked to a business."} Ask the business owner for a new invite link.</p>
          <Button variant="outline" onClick={async () => { await logout(); navigate("/login"); }}>Sign out</Button>
          <DeleteAccountButton />
        </div>
      </div>
    );
  }
  // A new owner finishes setup before using the app.
  if (me.role === "owner" && !me.onboarded) return <Navigate to="/onboarding" replace />;

  const nav = crew ? CREW_NAV : ADMIN_NAV;
  const unread = inbox.data?.unread ?? 0;
  const sideNav = crew ? CREW_NAV : [...ADMIN_NAV.slice(0, 6), INBOX_NAV, ...ADMIN_NAV.slice(6), SETTINGS_NAV];
  const width = NARROW.test(pathname) ? styles.narrow : MEDIUM.test(pathname) ? styles.medium : "";
  const roleLabel = me.role === "owner" ? "Owner" : me.role === "admin" ? "Office admin" : "Crew";
  return (
    <div className={`${styles.stage} ${className ?? ""}`}>
      {/* Tablet and desktop: navigation lives in a side rail instead of the bottom bar. */}
      <aside className={styles.sidebar} aria-label="Sidebar">
        <Link to={crew ? "/field" : "/"} className={styles.sideBrand}>
          <span className={styles.logo}>
            <Zap size={15} fill="currentColor" strokeWidth={0} />
          </span>
          <span className={styles.sideBrandText}>
            <span className={styles.brandName}>{me.businessName || "Local Service Pro"}</span>
            <span className={styles.brandTag}>HOME SERVICE OPS</span>
          </span>
        </Link>
        <nav className={styles.sideNav} aria-label="Main">
          {sideNav.map((n) => {
            const active = n.match(pathname);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                title={n.label}
                className={`${styles.sideItem} ${active ? styles.sideActive : ""}`}
              >
                <Icon size={20} strokeWidth={1.9} />
                <span>{n.label}</span>
                {n.to === "/inbox" && unread > 0 && <i className={styles.sideBadge}>{unread > 99 ? "99+" : unread}</i>}
              </Link>
            );
          })}
        </nav>
        <div className={styles.sideFoot}>
          <Link to={crew ? "/field/profile" : "/settings"} className={styles.sideAccount} title="Your account">
            <span className={styles.sideAvatar}>{opsFormat.initials(me.displayName || me.email)}</span>
            <span className={styles.sideAccountText}>
              <b>{me.displayName || me.email}</b>
              <small>{roleLabel}</small>
            </span>
          </Link>
          <button
            className={styles.sideLogout}
            title="Sign out"
            aria-label="Sign out"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className={styles.column}>
        <header className={styles.brandBar}>
          <Link to={crew ? "/field" : "/"} className={styles.brand}>
            <span className={styles.logo}>
              <Zap size={15} fill="currentColor" strokeWidth={0} />
            </span>
            <span className={styles.brandText}>
              <span className={styles.brandName}>{me.businessName || "Local Service Pro"}</span>
              <span className={styles.brandTag}>HOME SERVICE OPS</span>
            </span>
          </Link>
          {!crew && (
            <Link to="/inbox" className={styles.inboxBtn} aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}>
              <MessageSquare size={18} />
              {unread > 0 && <i className={styles.inboxBadge}>{unread > 9 ? "9+" : unread}</i>}
            </Link>
          )}
          <Link to={crew ? "/field/profile" : "/settings"} className={styles.account} aria-label="Your account">
            {opsFormat.initials(me.displayName || me.email)}
          </Link>
        </header>
        {!crew && <BillingBanner billing={me.billing} />}
        <main className={styles.main}>
          <div className={`${styles.content} ${width}`}>{children}</div>
        </main>
        <nav className={styles.nav} aria-label="Main">
          {nav.map((n) => {
            const active = n.match(pathname);
            const Icon = n.icon;
            return (
              <Link key={n.to} to={n.to} className={`${styles.navItem} ${active ? styles.navActive : ""}`}>
                <Icon size={21} strokeWidth={1.9} />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
