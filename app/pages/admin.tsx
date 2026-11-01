import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useQuery } from "@tanstack/react-query";
import { Zap, LayoutDashboard, Building2, LifeBuoy, Radio, ArrowLeft, LogOut } from "lucide-react";
import { useAuth } from "../helpers/useAuth";
import { saveReturnTo } from "../helpers/returnTo";
import { getAdminOverview } from "../endpoints/admin/overview_GET.schema";
import { AuthLoadingState } from "../components/AuthLoadingState";
import { AdminDashboard } from "../components/admin/AdminDashboard";
import { AdminCustomers } from "../components/admin/AdminCustomers";
import { AdminSupport } from "../components/admin/AdminSupport";
import { AdminSalesBrain } from "../components/admin/AdminSalesBrain";
import styles from "./admin.module.css";

export type AdminTab = "dashboard" | "customers" | "support" | "salesbrain";
const TABS: { k: AdminTab; label: string; icon: typeof Zap }[] = [
  { k: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { k: "customers", label: "Customers", icon: Building2 },
  { k: "support", label: "Support", icon: LifeBuoy },
  { k: "salesbrain", label: "Sales Brain sync", icon: Radio },
];

// Local Service Pro staff only (users.role = 'admin'): the standalone admin for running the app:
// a dashboard, every customer account, and the support desk. Sales Brain is only a feed for
// central tracking; everything here works on this app's own data.
export default function AdminPage() {
  const { authState, logout } = useAuth();
  const [params] = useSearchParams();
  const raw = params.get("tab");
  // Old email links are /admin?t=<ticket>.
  const tab: AdminTab = TABS.some((t) => t.k === raw) ? (raw as AdminTab) : params.get("t") ? "support" : params.get("c") ? "customers" : "dashboard";
  const signedIn = authState.type === "authenticated";
  // Also tells us whether this login is staff; the badge shows open requests.
  const ov = useQuery({ queryKey: ["admin", "overview"], queryFn: () => getAdminOverview({}), enabled: signedIn, refetchInterval: 60_000, retry: false });

  if (authState.type === "loading") return <AuthLoadingState title="Loading" />;
  if (authState.type === "unauthenticated") {
    saveReturnTo(window.location.pathname + window.location.search);
    return <Navigate to="/login" replace />;
  }
  if (ov.isLoading) return <AuthLoadingState title="Loading the admin" />;
  if (ov.error) {
    return (
      <div className={styles.page}>
        <div className={styles.deniedPage}>
          <h1>Staff only</h1>
          <p>{ov.error instanceof Error ? ov.error.message : "This page is for Local Service Pro staff."}</p>
          <Link to="/">Back to the app</Link>
        </div>
      </div>
    );
  }
  const openCount = ov.data?.support.open ?? 0; // waiting on us
  return (
    <div className={styles.page}>
      <Helmet>
        <title>Admin · Home Service Ops</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <header className={styles.top}>
        <Link to="/admin" className={styles.brand}>
          <span className={styles.mark}>
            <Zap size={15} fill="currentColor" strokeWidth={0} />
          </span>
          <span>
            <b>Home Service Ops</b>
            <small>LOCAL SERVICE PRO ADMIN</small>
          </span>
        </Link>
        <nav className={styles.tabs}>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <Link key={t.k} to={t.k === "dashboard" ? "/admin" : `/admin?tab=${t.k}`} className={tab === t.k ? styles.tabOn : styles.tab}>
                <Icon size={15} /> {t.label}
                {t.k === "support" && openCount > 0 && <i className={styles.tabBadge}>{openCount}</i>}
              </Link>
            );
          })}
        </nav>
        <span className={styles.topRight}>
          <Link to="/" className={styles.topLink}>
            <ArrowLeft size={14} /> App
          </Link>
          <button className={styles.topLink} onClick={() => logout().then(() => window.location.assign("/login"))}>
            <LogOut size={14} /> Sign out
          </button>
        </span>
      </header>
      <main className={styles.main}>
        {tab === "dashboard" && ov.data && <AdminDashboard data={ov.data} />}
        {tab === "customers" && <AdminCustomers />}
        {tab === "support" && <AdminSupport />}
        {tab === "salesbrain" && <AdminSalesBrain />}
      </main>
    </div>
  );
}
