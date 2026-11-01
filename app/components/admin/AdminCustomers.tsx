import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Search, Mail, Phone, ExternalLink, Gift, CalendarPlus, Ban, Send, Trash2, StickyNote, PauseCircle, PlayCircle, FlaskConical, ShieldAlert, Eye } from "lucide-react";
import { postAdminViewAs } from "../../endpoints/admin/view_as_POST.schema";
import { enterSupportView } from "../../helpers/supportView";
import { getAdminCustomers } from "../../endpoints/admin/customers_GET.schema";
import { getAdminCustomer } from "../../endpoints/admin/customer_GET.schema";
import { postAdminCustomerAction, type InputType as ActionInput } from "../../endpoints/admin/customer_action_POST.schema";
import { postAdminTicketCreate } from "../../endpoints/admin/ticket_create_POST.schema";
import { ACCESS_LABEL, TRADE_LABEL, aud, type AdminCustomer, type AdminCustomerDetail, type CustomerAccess } from "../../helpers/adminShared";
import { TICKET_PRIORITIES, priorityLabel, staffStatusLabel, type TicketPriority } from "../../helpers/supportShared";
import { opsFormat } from "../../helpers/opsFormat";
import { Button } from "../Button";
import { Input } from "../Input";
import { Textarea } from "../Textarea";
import { Skeleton } from "../Skeleton";
import { BottomSheet } from "../BottomSheet";
import styles from "../../pages/admin.module.css";

const FILTERS: { k: CustomerAccess | "all"; label: string }[] = [
  { k: "all", label: "All" },
  { k: "paying", label: "Paying" },
  { k: "trial", label: "Trial" },
  { k: "included", label: "Sales Brain" },
  { k: "free", label: "Free" },
  { k: "past_due", label: "Overdue" },
  { k: "suspended", label: "Suspended" },
  { k: "none", label: "Not subscribed" },
];
const SORTS = { newest: "Newest", active: "Last active", mrr: "Revenue", name: "Name" } as const;
type Sort = keyof typeof SORTS;

const date = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—");
const ago = (d: Date | string | null | undefined) => (d ? opsFormat.timeAgo(d) : "never");

export function AccessBadge({ access }: { access: CustomerAccess }) {
  return <span className={`${styles.badge} ${styles[`a_${access}`] ?? ""}`}>{ACCESS_LABEL[access]}</span>;
}

// Admin → Customers: every business using the app, and each one in full.
export function AdminCustomers() {
  const [params] = useSearchParams();
  const id = Number(params.get("c")) || null;
  return id ? <CustomerDetail id={id} /> : <CustomerList />;
}

function CustomerList() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const access = (params.get("access") as CustomerAccess | null) ?? "all";
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "customers"], queryFn: () => getAdminCustomers({}), refetchInterval: 120_000 });

  const rows = useMemo(() => {
    let list = data?.customers ?? [];
    if (access !== "all") list = list.filter((c) => (access === "none" ? c.access === "none" || c.access === "paused" : c.access === access));
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((c) => [c.name, c.ownerName, c.email, c.phone, String(c.id)].some((v) => v?.toLowerCase().includes(term)));
    const t = (d: Date | string | null) => (d ? new Date(d).getTime() : 0);
    return [...list].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "mrr" ? b.mrrCents - a.mrrCents : sort === "active" ? t(b.lastActiveAt) - t(a.lastActiveAt) : t(b.signedUpAt) - t(a.signedUpAt),
    );
  }, [data, access, q, sort]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: data?.customers.length ?? 0 };
    for (const c of data?.customers ?? []) {
      const k = c.access === "paused" ? "none" : c.access;
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [data]);

  if (error) return <p className={styles.denied}>{error instanceof Error ? error.message : "Couldn't load customers"}</p>;
  return (
    <div className={styles.customers}>
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search business, owner, email, phone or id" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={styles.select} aria-label="Sort">
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              Sort: {v}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.filters}>
        {FILTERS.map((f) => (
          <button
            key={f.k}
            className={access === f.k ? styles.filterOn : styles.filter}
            onClick={() => {
              const p = new URLSearchParams(params);
              if (f.k === "all") p.delete("access");
              else p.set("access", f.k);
              setParams(p);
            }}
          >
            {f.label}
            {counts[f.k] ? <i>{counts[f.k]}</i> : null}
          </button>
        ))}
      </div>
      {isLoading ? (
        [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className={styles.skel} />)
      ) : !rows.length ? (
        <p className={styles.muted}>No customers match.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Business</th>
                <th>Access</th>
                <th className={styles.num}>Per month</th>
                <th className={styles.num}>Jobs 30d</th>
                <th className={styles.num}>Users</th>
                <th>Last active</th>
                <th>Signed up</th>
                <th className={styles.num}>Tickets</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/admin?tab=customers&c=${c.id}`)} className={styles.clickRow}>
                  <td>
                    <b>
                      {c.name} {c.demo && <span className={styles.demoTag}>Demo</span>}
                    </b>
                    <small>
                      {c.ownerName || "—"} · {c.email || "no email"}
                    </small>
                  </td>
                  <td>
                    <AccessBadge access={c.access} />
                    <small>{c.plan}</small>
                  </td>
                  <td className={styles.num}>{c.mrrCents ? aud(c.mrrCents) : "—"}</td>
                  <td className={styles.num}>{c.jobs30d}</td>
                  <td className={styles.num}>{c.users}</td>
                  <td>{ago(c.lastActiveAt)}</td>
                  <td>{date(c.signedUpAt)}</td>
                  <td className={styles.num}>{c.openTickets ? <span className={styles.countPill}>{c.openTickets}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CustomerDetail({ id }: { id: number }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const key = ["admin", "customer", id];
  const { data: c, isLoading, error } = useQuery({ queryKey: key, queryFn: () => getAdminCustomer({ id }) });
  const [compOpen, setCompOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [note, setNote] = useState("");

  const act = useMutation({
    mutationFn: (change: ActionInput["change"]) => postAdminCustomerAction({ customerId: id, change }),
    onSuccess: (r) => {
      toast.success(r.message);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["admin", "customers"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
  });

  if (isLoading) return <Skeleton className={styles.skelBig} />;
  if (error || !c) return <p className={styles.denied}>{error instanceof Error ? error.message : "Couldn't load this customer"}</p>;
  const b = c.billing;
  const live = ["active", "trialing", "past_due", "unpaid"].includes(b.subscriptionStatus ?? "");

  return (
    <div className={styles.customer}>
      <Link to="/admin?tab=customers" className={styles.back}>
        <ArrowLeft size={16} /> All customers
      </Link>
      <div className={styles.custHead}>
        <div>
          <h2>
            {c.name} {c.demo && <span className={styles.demoTag}><FlaskConical size={11} /> Demo</span>}
          </h2>
          <p className={styles.muted}>
            Account {c.id} · signed up {date(c.signedUpAt)} · last active {ago(c.lastActiveAt)}
            {c.salesBrain ? " · linked to Sales Brain" : ""}
          </p>
        </div>
        <div className={styles.custHeadRight}>
          <Button size="sm" onClick={() => setViewOpen(true)}>
            <Eye size={14} /> View as customer
          </Button>
          <AccessBadge access={c.access} />
          <b className={styles.mrr}>{c.mrrCents ? `${aud(c.mrrCents)}/mo` : "$0/mo"}</b>
        </div>
      </div>

      {c.suspendedAt && (
        <div className={styles.suspendedBox}>
          <PauseCircle size={18} />
          <span>
            <b>Access suspended {date(c.suspendedAt)}</b>
            {c.suspendedReason ? ` · ${c.suspendedReason}` : ""}. Nobody at this business can use the app; they can still message support.
          </span>
          <Button size="sm" onClick={() => act.mutate({ action: "reinstate" })} disabled={act.isPending}>
            <PlayCircle size={14} /> Reinstate
          </Button>
        </div>
      )}

      <div className={styles.cards}>
        <section className={styles.panel}>
          <h3>Contact & business</h3>
          <dl className={styles.dl}>
            <dt>Owner</dt>
            <dd>{c.ownerName || "—"}</dd>
            <dt>Email</dt>
            <dd>{c.email ? <a href={`mailto:${c.email}`}><Mail size={13} /> {c.email}</a> : "—"}</dd>
            <dt>Phone</dt>
            <dd>{c.phone ? <a href={`tel:${c.phone}`}><Phone size={13} /> {c.phone}</a> : "—"}</dd>
            <dt>Trade</dt>
            <dd>{TRADE_LABEL[c.trade] ?? c.trade ?? "—"}</dd>
            <dt>ABN</dt>
            <dd>{c.details.abn || "—"}</dd>
            <dt>Address</dt>
            <dd>{c.details.address || "—"}</dd>
            <dt>Service area</dt>
            <dd>{c.details.area || "—"}</dd>
            <dt>Website</dt>
            <dd>{c.details.website ? <a href={c.details.website.startsWith("http") ? c.details.website : `https://${c.details.website}`} target="_blank" rel="noreferrer">{c.details.website} <ExternalLink size={12} /></a> : "—"}</dd>
            <dt>Set-up</dt>
            <dd>{c.onboardedAt ? `Finished ${date(c.onboardedAt)}` : "Not finished"}</dd>
          </dl>
        </section>

        <section className={styles.panel}>
          <h3>Plan & billing</h3>
          <dl className={styles.dl}>
            <dt>Access</dt>
            <dd>
              {ACCESS_LABEL[c.access]} · {c.plan}
            </dd>
            {c.access === "trial" && (
              <>
                <dt>Trial ends</dt>
                <dd>{date(c.trialEndsAt)}</dd>
              </>
            )}
            {b.comp && (
              <>
                <dt>Free access</dt>
                <dd>
                  {b.compSource === "salesbrain" ? "Included with Sales Brain" : "Given by staff"}
                  {b.compNote ? ` · ${b.compNote}` : ""}
                  {b.compEndsAt ? ` · until ${date(b.compEndsAt)}` : ""}
                </dd>
              </>
            )}
            <dt>Subscription</dt>
            <dd>
              {b.subscriptionStatus ? `${b.subscriptionStatus}${b.cancelAtPeriodEnd ? " (cancels at period end)" : ""}` : "None"}
              {b.currentPeriodEnd && live ? ` · renews ${date(b.currentPeriodEnd)}` : ""}
            </dd>
            <dt>Last charge</dt>
            <dd>{b.lastInvoiceCents ? aud(b.lastInvoiceCents) : "—"}</dd>
            <dt>Lifetime paid</dt>
            <dd>{aud(b.lifetimeCents)}</dd>
            {c.cancelReason && (
              <>
                <dt>Cancel reason</dt>
                <dd>{c.cancelReason}</dd>
              </>
            )}
            {b.salesBrainCustomerId && (
              <>
                <dt>Sales Brain</dt>
                <dd>
                  {b.salesBrainPlan || "Linked"} · <code>{b.salesBrainCustomerId}</code>
                </dd>
              </>
            )}
            {b.stripeCustomerId && (
              <>
                <dt>Stripe</dt>
                <dd>
                  <a href={`https://dashboard.stripe.com/customers/${b.stripeCustomerId}`} target="_blank" rel="noreferrer">
                    {b.stripeCustomerId} <ExternalLink size={12} />
                  </a>
                </dd>
              </>
            )}
          </dl>
          <div className={styles.actionRow}>
            {b.comp ? (
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() => {
                  const sb = b.compSource === "salesbrain";
                  if (window.confirm(sb ? "This free access comes from their Sales Brain plan. Remove it anyway? Sales Brain will see the account change." : "Remove free access? Without a plan or trial the app asks them to subscribe.")) act.mutate({ action: "comp_off" });
                }}
              >
                <Ban size={14} /> Remove free access
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setCompOpen(true)} disabled={act.isPending}>
                <Gift size={14} /> Give free access
              </Button>
            )}
            {!b.comp && !live && (
              <>
                <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ action: "extend_trial", days: 7 })}>
                  <CalendarPlus size={14} /> {c.access === "trial" ? "Extend trial 7 days" : "Give a 7-day trial"}
                </Button>
                <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ action: "extend_trial", days: 30 })}>
                  +30 days
                </Button>
              </>
            )}
            {live && b.stripeSubscriptionId && (
              <Button
                size="sm"
                variant="destructive"
                disabled={act.isPending}
                onClick={() => {
                  if (window.confirm("Cancel their subscription now? It ends immediately with no further charges and no refund.")) act.mutate({ action: "cancel_subscription" });
                }}
              >
                Cancel subscription
              </Button>
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <h3>Usage</h3>
          <div className={styles.usage}>
            <span>
              <b>{c.usage.jobs30d}</b>
              <small>jobs, 30 days</small>
            </span>
            <span>
              <b>{c.usage.jobs}</b>
              <small>jobs, all time</small>
            </span>
            <span>
              <b>{c.usage.quotes}</b>
              <small>quotes</small>
            </span>
            <span>
              <b>{c.usage.clients}</b>
              <small>clients</small>
            </span>
          </div>
          <p className={styles.muted}>Last job added {ago(c.usage.lastJobAt)}.</p>
        </section>

        <section className={styles.panel}>
          <h3>Team ({c.members.length})</h3>
          {!c.members.length && !c.invites.length && <p className={styles.muted}>{c.demo ? "Demo accounts have no logins." : "No logins yet."}</p>}
          {c.members.map((m) => (
            <div key={m.id} className={styles.memberRow}>
              <span>
                <b>{m.name}</b>
                <small>{m.email}</small>
              </span>
              <span className={styles.roleTag}>{m.role === "admin" ? "Office" : m.role === "owner" ? "Owner" : "Crew"}</span>
            </div>
          ))}
          {c.invites.map((i) => (
            <div key={`i${i.id}`} className={styles.memberRow}>
              <span>
                <b>{i.email || "Link invite"}</b>
                <small>Invited {ago(i.sentAt)} · expires {date(i.expiresAt)}</small>
              </span>
              <span className={styles.roleTag}>Invited</span>
            </div>
          ))}
        </section>

        <section className={`${styles.panel} ${styles.wide}`}>
          <h3>Payments ({c.payments.length})</h3>
          {c.payments.length ? (
            <div className={styles.tableWrapFlat}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th className={styles.num}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {c.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{date(p.paidAt)}</td>
                      <td>{p.description || p.kind}</td>
                      <td>
                        <span className={`${styles.payPill} ${styles[`pay_${p.status}`] ?? ""}`}>{p.status === "paid" ? "Paid" : p.status === "failed" ? "Failed" : "Refunded"}</span>
                      </td>
                      <td className={styles.num}>{p.status === "refunded" ? `−${aud(p.amountCents)}` : aud(p.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.muted}>No payments recorded.</p>
          )}
        </section>

        <section className={`${styles.panel} ${styles.wide}`}>
          <div className={styles.panelHead}>
            <h3>Support ({c.tickets.length})</h3>
            <Button size="sm" onClick={() => setMessageOpen(true)}>
              <Send size={14} /> Message customer
            </Button>
          </div>
          {c.tickets.length ? (
            c.tickets.map((t) => (
              <Link key={t.id} to={`/admin?tab=tickets&t=${t.id}`} className={styles.miniRow}>
                <span>
                  <b>{t.subject}</b>
                  <small>
                    #{t.id} · {staffStatusLabel(t.status)} · {opsFormat.timeAgo(t.updatedAt)}
                    {t.assigneeName ? ` · ${t.assigneeName}` : ""}
                  </small>
                </span>
                <span className={`${styles.prio} ${styles[`p_${t.priority}`] ?? ""}`}>{priorityLabel(t.priority)}</span>
              </Link>
            ))
          ) : (
            <p className={styles.muted}>No support requests yet.</p>
          )}
        </section>

        <section className={`${styles.panel} ${styles.wide}`}>
          <h3>
            <StickyNote size={15} /> Staff notes
          </h3>
          <p className={styles.muted}>Only Local Service Pro staff see these.</p>
          <div className={styles.noteForm}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note: a call, a promise, context for the next person…" />
            <Button
              size="sm"
              disabled={!note.trim() || act.isPending}
              onClick={() => act.mutate({ action: "note", body: note.trim() }, { onSuccess: () => setNote("") })}
            >
              Add note
            </Button>
          </div>
          {c.notes.map((n) => (
            <div key={n.id} className={styles.note}>
              <p>{n.body}</p>
              <small>
                {n.authorName} · {ago(n.createdAt)}
                <button
                  className={styles.iconBtn}
                  aria-label="Delete note"
                  onClick={() => {
                    if (window.confirm("Delete this note?")) act.mutate({ action: "delete_note", noteId: n.id });
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </small>
            </div>
          ))}
        </section>
      </div>

      <section className={`${styles.panel} ${styles.wide}`}>
        <h3>
          <Eye size={15} /> Support views ({c.supportSessions.length})
        </h3>
        <p className={styles.muted}>Every time staff open this account with "View as customer", and how many changes they made.</p>
        {c.supportSessions.length ? (
          <div className={styles.tableWrapFlat}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Staff</th>
                  <th>Reason</th>
                  <th>Mode</th>
                  <th className={styles.num}>Changes</th>
                </tr>
              </thead>
              <tbody>
                {c.supportSessions.map((v) => (
                  <tr key={v.id}>
                    <td>
                      {date(v.startedAt)} {new Date(v.startedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}
                      <small>{v.endedAt ? "ended" : new Date(v.expiresAt).getTime() > Date.now() ? "open now" : "expired"}</small>
                    </td>
                    <td>{v.staffName}</td>
                    <td className={styles.wrapCell}>{v.reason}</td>
                    <td>{v.allowChanges ? "Changes allowed" : "Read-only"}</td>
                    <td className={styles.num}>{v.changes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.muted}>Nobody has viewed this account yet.</p>
        )}
      </section>

      <section className={styles.danger}>
        <h3>
          <ShieldAlert size={16} /> Access & account
        </h3>
        <div className={styles.dangerRow}>
          <span>
            <b>{c.suspendedAt ? "Reinstate access" : "Suspend access"}</b>
            <small>{c.suspendedAt ? "Let everyone at this business use the app again." : "Nobody at this business can use the app until you reinstate it. Their data is kept; they can still message support."}</small>
          </span>
          {c.suspendedAt ? (
            <Button size="sm" variant="outline" onClick={() => act.mutate({ action: "reinstate" })} disabled={act.isPending}>
              <PlayCircle size={14} /> Reinstate
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setSuspendOpen(true)} disabled={act.isPending}>
              <PauseCircle size={14} /> Suspend access
            </Button>
          )}
        </div>
        <div className={styles.dangerRow}>
          <span>
            <b>Delete account</b>
            <small>Deletes the business and everything in it: jobs, quotes, clients, invoices, payments, support history. Their subscription is cancelled and logins only used here are removed. This can't be undone.</small>
          </span>
          <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)} disabled={act.isPending}>
            <Trash2 size={14} /> Delete account
          </Button>
        </div>
      </section>

      <ViewAsSheet open={viewOpen} onOpenChange={setViewOpen} customer={c} />
      <SuspendSheet
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        live={live}
        pending={act.isPending}
        onSave={(reason, cancelSubscription) => act.mutate({ action: "suspend", reason, cancelSubscription }, { onSuccess: () => setSuspendOpen(false) })}
      />
      <DeleteSheet
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        name={c.name}
        pending={act.isPending}
        onDelete={(confirmName) =>
          act.mutate(
            { action: "delete", confirmName },
            {
              onSuccess: () => {
                setDeleteOpen(false);
                navigate("/admin?tab=customers");
              },
            },
          )
        }
      />
      <CompSheet open={compOpen} onOpenChange={setCompOpen} pending={act.isPending} onSave={(note, endsAt) => act.mutate({ action: "comp_on", note, endsAt }, { onSuccess: () => setCompOpen(false) })} />
      <MessageSheet customer={c} open={messageOpen} onOpenChange={setMessageOpen} onSent={(tid) => navigate(`/admin?tab=tickets&t=${tid}`)} />
    </div>
  );
}

function CompSheet({ open, onOpenChange, onSave, pending }: { open: boolean; onOpenChange: (o: boolean) => void; onSave: (note: string, endsAt: Date | null) => void; pending: boolean }) {
  const [note, setNote] = useState("");
  const [until, setUntil] = useState("");
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Give free access"
      description="The Team plan at no cost. They aren't charged by the app while it lasts."
      footer={
        <Button size="lg" disabled={pending} onClick={() => onSave(note.trim(), until ? new Date(`${until}T23:59:59+10:00`) : null)}>
          {pending ? "Saving…" : "Give free access"}
        </Button>
      }
    >
      <div className={styles.sheetForm}>
        <label>
          <span>Reason (shown to the customer on Plan & billing)</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Included with your Local Service Pro website" maxLength={200} />
        </label>
        <label>
          <span>Until (optional)</span>
          <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
          <small>Leave empty for no end date.</small>
        </label>
      </div>
    </BottomSheet>
  );
}

function MessageSheet({ customer, open, onOpenChange, onSent }: { customer: AdminCustomerDetail | AdminCustomer; open: boolean; onOpenChange: (o: boolean) => void; onSent: (id: number) => void }) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const send = useMutation({
    mutationFn: () => postAdminTicketCreate({ businessId: customer.id, subject: subject.trim(), body: body.trim(), priority, category: "other", origin: window.location.origin }),
    onSuccess: (r) => {
      toast.success(`Sent to ${customer.email || customer.name}`);
      qc.invalidateQueries({ queryKey: ["admin"] });
      setSubject("");
      setBody("");
      onOpenChange(false);
      onSent(r.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send"),
  });
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Message ${customer.name}`}
      description={`Starts a support conversation. ${customer.email ? `${customer.email} is emailed and` : "They"} can reply in the app.`}
      footer={
        <Button size="lg" disabled={subject.trim().length < 3 || !body.trim() || send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? "Sending…" : "Send"}
        </Button>
      }
    >
      <div className={styles.sheetForm}>
        <label>
          <span>Subject</span>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} placeholder="e.g. Checking in on your set-up" />
        </label>
        <label>
          <span>Message</span>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={5000} />
        </label>
        <label>
          <span>Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={styles.select}>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </BottomSheet>
  );
}

function SuspendSheet({ open, onOpenChange, onSave, pending, live }: { open: boolean; onOpenChange: (o: boolean) => void; onSave: (reason: string, cancelSubscription: boolean) => void; pending: boolean; live: boolean }) {
  const [reason, setReason] = useState("");
  const [cancel, setCancel] = useState(false);
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Suspend access"
      description="Everyone at this business is locked out of the app until you reinstate it. Nothing is deleted."
      footer={
        <Button size="lg" variant="destructive" disabled={pending} onClick={() => onSave(reason.trim(), cancel)}>
          {pending ? "Suspending…" : "Suspend access"}
        </Button>
      }
    >
      <div className={styles.sheetForm}>
        <label>
          <span>Reason (they see this)</span>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Unpaid invoices, chargeback under review" maxLength={300} />
        </label>
        {live && (
          <label className={styles.checkRow}>
            <input type="checkbox" checked={cancel} onChange={(e) => setCancel(e.target.checked)} />
            <span>Also cancel their subscription now (no further charges)</span>
          </label>
        )}
      </div>
    </BottomSheet>
  );
}

function DeleteSheet({ open, onOpenChange, onDelete, pending, name }: { open: boolean; onOpenChange: (o: boolean) => void; onDelete: (confirmName: string) => void; pending: boolean; name: string }) {
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toLowerCase() === name.trim().toLowerCase();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${name}?`}
      description="This permanently deletes the business, all its data and logins used only here, and cancels their subscription. It can't be undone."
      footer={
        <Button size="lg" variant="destructive" disabled={!ok || pending} onClick={() => onDelete(typed)}>
          {pending ? "Deleting…" : "Delete account forever"}
        </Button>
      }
    >
      <div className={styles.sheetForm}>
        <label>
          <span>
            Type <b>{name}</b> to confirm
          </span>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoComplete="off" />
        </label>
      </div>
    </BottomSheet>
  );
}

/** Opens the customer's account in this tab as its owner, with the staff member's own login. */
export function ViewAsSheet({
  open,
  onOpenChange,
  customer,
  reason: initialReason = "",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer: { id: number; name: string };
  reason?: string;
}) {
  const [reason, setReason] = useState(initialReason);
  const [allowChanges, setAllowChanges] = useState(false);
  const [minutes, setMinutes] = useState(60);
  const start = useMutation({
    mutationFn: () => postAdminViewAs({ businessId: customer.id, reason: reason.trim(), allowChanges, minutes }),
    onSuccess: (r) =>
      enterSupportView({ id: r.sessionId, businessId: r.businessId, businessName: r.businessName, allowChanges: r.allowChanges, expiresAt: new Date(r.expiresAt).toISOString() }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't open the account"),
  });
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`View ${customer.name} as the customer`}
      description="Opens their account in this tab with your own login, as if you were the owner. A banner shows while you're in it; Exit brings you back here. It's recorded on the account."
      footer={
        <Button size="lg" disabled={reason.trim().length < 3 || start.isPending} onClick={() => start.mutate()}>
          <Eye size={16} /> {start.isPending ? "Opening…" : "Open their account"}
        </Button>
      }
    >
      <div className={styles.sheetForm}>
        <label>
          <span>Why (kept on the account)</span>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Ticket #22: checking their quote settings" maxLength={300} autoFocus />
        </label>
        <label>
          <span>For</span>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={styles.select}>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
            <option value={120}>2 hours</option>
          </select>
        </label>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={allowChanges} onChange={(e) => setAllowChanges(e.target.checked)} />
          <span>Allow changes (otherwise read-only). Every change is recorded.</span>
        </label>
      </div>
    </BottomSheet>
  );
}
