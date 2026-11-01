import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Zap, LayoutDashboard, Building2, LifeBuoy, Radio, ArrowLeft, LogOut, Search, FlaskConical, Inbox, BarChart3 } from "lucide-react";
import { useAuth } from "../helpers/useAuth";
import { saveReturnTo } from "../helpers/returnTo";
import { getAdminOverview } from "../endpoints/admin/overview_GET.schema";
import { getAdminCustomers } from "../endpoints/admin/customers_GET.schema";
import { getAdminTickets } from "../endpoints/admin/tickets_GET.schema";
import { postAdminDemo } from "../endpoints/admin/demo_POST.schema";
import { ACCESS_LABEL } from "../helpers/adminShared";
import { staffStatusLabel } from "../helpers/supportShared";
import { opsFormat } from "../helpers/opsFormat";
import { AuthLoadingState } from "../components/AuthLoadingState";
import { AdminDashboard } from "../components/admin/AdminDashboard";
import { AdminCustomers } from "../components/admin/AdminCustomers";
import { AdminSupport } from "../components/admin/AdminSupport";
import { AdminSupportOverview } from "../components/admin/AdminSupportOverview";
import { AdminSalesBrain } from "../components/admin/AdminSalesBrain";
import styles from "./admin.module.css";

export type AdminTab = "dashboard" | "customers" | "support" | "tickets" | "salesbrain";
const NAV: { k: AdminTab; label: string; icon: typeof Zap; sub?: boolean }[] = [
  { k: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { k: "customers", label: "Customers", icon: Building2 },
  { k: "support", label: "Support overview", icon: BarChart3 },
  { k: "tickets", label: "Tickets", icon: Inbox },
  { k: "salesbrain", label: "Sales Brain sync", icon: Radio },
];
const TITLES: Record<AdminTab, [string, string]> = {
  dashboard: ["Dashboard", "Revenue, growth and how customers use the app"],
  customers: ["Customers", "Every business on Home Service Ops"],
  support: ["Support overview", "Volume, response times and workload"],
  tickets: ["Tickets", "Answer, assign and resolve customer requests"],
  salesbrain: ["Sales Brain sync", "The feed Local Service Pro uses to track customers centrally"],
};

// Local Service Pro staff only (users.role = 'admin'): the standalone admin for running the app.
// It works on this app's own data; Sales Brain only receives a copy for central tracking.
export default function AdminPage() {
  const { authState, logout } = useAuth();
  const [params] = useSearchParams();
  const raw = params.get("tab");
  // Old links: /admin?t=<ticket>, /admin?tab=support&t=<ticket>.
  const tab: AdminTab = params.get("t") ? "tickets" : NAV.some((n) => n.k === raw) ? (raw as AdminTab) : params.get("c") ? "customers" : "dashboard";
  const signedIn = authState.type === "authenticated";
  const ov = useQuery({ queryKey: ["admin", "overview"], queryFn: () => getAdminOverview({}), enabled: signedIn, refetchInterval: 60_000, retry: false });

  if (authState.type === "loading") return <AuthLoadingState title="Loading" />;
  if (authState.type === "unauthenticated") {
    saveReturnTo(window.location.pathname + window.location.search);
    return <Navigate to="/login" replace />;
  }
  if (ov.isLoading) return <AuthLoadingState title="Loading the admin" />;
  if (ov.error || !ov.data) {
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
  const [title, subtitle] = TITLES[tab];
  const open = ov.data.support.open;
  return (
    <div className={styles.shell}>
      <Helmet>
        <title>{title} · Admin · Home Service Ops</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <aside className={styles.side}>
        <Link to="/admin" className={styles.sideBrand}>
          <span className={styles.mark}>
            <Zap size={16} fill="currentColor" strokeWidth={0} />
          </span>
          <span>
            <b>Home Service Ops</b>
            <small>ADMIN</small>
          </span>
        </Link>
        <nav className={styles.sideNav}>
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <Link key={n.k} to={n.k === "dashboard" ? "/admin" : `/admin?tab=${n.k}`} className={`${styles.sideItem} ${tab === n.k ? styles.sideOn : ""}`}>
                <Icon size={18} />
                <span>{n.label}</span>
                {n.k === "tickets" && open > 0 && <i className={styles.sideBadge}>{open}</i>}
              </Link>
            );
          })}
        </nav>
        <div className={styles.sideFoot}>
          <DemoCard loaded={ov.data.demo} />
          <Link to="/" className={styles.sideLink}>
            <ArrowLeft size={15} /> Back to the app
          </Link>
          <button className={styles.sideLink} onClick={() => logout().then(() => window.location.assign("/login"))}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
      <div className={styles.body}>
        <header className={styles.topbar}>
          <div className={styles.titles}>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <GlobalSearch />
        </header>
        {ov.data.demo && (
          <div className={styles.demoBanner}>
            <FlaskConical size={15} /> You're looking at demo data mixed with real accounts. Demo customers are marked <b>Demo</b>; remove them from the sidebar when you're done.
          </div>
        )}
        <main className={styles.content}>
          {tab === "dashboard" && <AdminDashboard data={ov.data} />}
          {tab === "customers" && <AdminCustomers />}
          {tab === "support" && <AdminSupportOverview />}
          {tab === "tickets" && <AdminSupport />}
          {tab === "salesbrain" && <AdminSalesBrain />}
        </main>
      </div>
    </div>
  );
}

function DemoCard({ loaded }: { loaded: boolean }) {
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: (action: "load" | "clear") => postAdminDemo({ action }),
    onSuccess: (r) => {
      toast.success(r.message);
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't change demo data"),
  });
  return (
    <div className={styles.demoCard}>
      <b>
        <FlaskConical size={14} /> Demo data
      </b>
      <p>{loaded ? "24 sample customers, a year of payments and support requests are loaded." : "Load sample customers, payments and tickets to explore the admin."}</p>
      {loaded ? (
        <div className={styles.demoBtns}>
          <button onClick={() => run.mutate("load")} disabled={run.isPending}>
            Reset
          </button>
          <button onClick={() => window.confirm("Remove every demo customer and everything in them? Real accounts aren't touched.") && run.mutate("clear")} disabled={run.isPending}>
            Remove
          </button>
        </div>
      ) : (
        <div className={styles.demoBtns}>
          <button onClick={() => run.mutate("load")} disabled={run.isPending}>
            {run.isPending ? "Loading…" : "Load demo data"}
          </button>
        </div>
      )}
    </div>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const customers = useQuery({ queryKey: ["admin", "customers"], queryFn: () => getAdminCustomers({}), enabled: term.length >= 2, staleTime: 60_000 });
  const tickets = useQuery({ queryKey: ["admin", "tickets", "all", "all", term], queryFn: () => getAdminTickets({ status: "all", q: term }), enabled: term.length >= 2 });
  const matches = useMemo(() => {
    const t = term.toLowerCase();
    return (customers.data?.customers ?? []).filter((c) => [c.name, c.ownerName, c.email, c.phone, String(c.id)].some((v) => v?.toLowerCase().includes(t))).slice(0, 5);
  }, [customers.data, term]);
  const go = (to: string) => {
    setOpen(false);
    setQ("");
    navigate(to);
  };
  return (
    <div className={styles.globalSearch} ref={box}>
      <Search size={16} />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search customers and tickets…"
        aria-label="Search customers and tickets"
      />
      {open && term.length >= 2 && (
        <div className={styles.searchPop}>
          <small>Customers</small>
          {matches.length ? (
            matches.map((c) => (
              <button key={c.id} onClick={() => go(`/admin?tab=customers&c=${c.id}`)}>
                <b>{c.name}</b>
                <span>
                  {c.ownerName || c.email} · {ACCESS_LABEL[c.access]}
                </span>
              </button>
            ))
          ) : (
            <p>{customers.isLoading ? "Searching…" : "No customers match."}</p>
          )}
          <small>Tickets</small>
          {(tickets.data?.tickets ?? []).slice(0, 5).map((t) => (
            <button key={t.id} onClick={() => go(`/admin?tab=tickets&t=${t.id}`)}>
              <b>
                #{t.id} {t.subject}
              </b>
              <span>
                {t.businessName} · {staffStatusLabel(t.status)} · {opsFormat.timeAgo(t.updatedAt)}
              </span>
            </button>
          ))}
          {!tickets.isLoading && !tickets.data?.tickets.length && <p>No tickets match.</p>}
        </div>
      )}
    </div>
  );
}
