import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, Check, CreditCard, Download, ExternalLink, FileText, RotateCcw, Sparkles } from "lucide-react";
import { getBillingStatus } from "../endpoints/billing/status_GET.schema";
import { getBillingOverview } from "../endpoints/billing/overview_GET.schema";
import { postBillingCheckout } from "../endpoints/billing/checkout_POST.schema";
import { postBillingPortal } from "../endpoints/billing/portal_POST.schema";
import { postBillingRefresh } from "../endpoints/billing/refresh_POST.schema";
import { postBillingManage, type InputType as ManageInput } from "../endpoints/billing/manage_POST.schema";
import { PLANS, statusLabel, type PlanKey } from "../helpers/plans";
import { PageHeader } from "../components/PageHeader";
import { SectionLabel } from "../components/SectionLabel";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Skeleton } from "../components/Skeleton";
import { BottomSheet } from "../components/BottomSheet";
import styles from "./settings.billing.module.css";

const fmtDate = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
const daysUntil = (d: Date | null | undefined) => (d ? Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)) : 0);
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const BRAND: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover", jcb: "JCB", unionpay: "UnionPay", diners: "Diners Club" };
const PLAN_ORDER: PlanKey[] = ["solo", "team"];

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const tone = pct >= 100 ? styles.full : pct >= 80 ? styles.warn : "";
  return (
    <div className={styles.meter}>
      <div className={styles.meterTop}>
        <span>{label}</span>
        <b>
          {used} <small>/ {limit}</small>
        </b>
      </div>
      <div className={styles.bar}>
        <span className={tone} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

type Confirm = { kind: "change"; plan: PlanKey } | { kind: "cancel" } | null;
const EMPTY_DETAILS = { name: "", email: "", line1: "", city: "", state: "", postcode: "" };

export default function BillingPage() {
  const qc = useQueryClient();
  const { data: b } = useQuery({ queryKey: ["billing"], queryFn: () => getBillingStatus() });
  const owner = !!b?.canManage;
  const { data: ov, isLoading: ovLoading } = useQuery({
    queryKey: ["billing", "overview"],
    queryFn: () => getBillingOverview(),
    enabled: owner && !!b?.hasCustomer && !!b?.stripeReady,
  });
  const popupRef = useRef<Window | null>(null);
  const plansRef = useRef<HTMLDivElement | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [details, setDetails] = useState(EMPTY_DETAILS);

  useEffect(() => {
    if (ov?.details) setDetails(ov.details);
  }, [ov?.details]);

  const reload = () => {
    qc.invalidateQueries({ queryKey: ["billing"] });
    qc.invalidateQueries({ queryKey: ["account", "me"] });
  };
  const refresh = useMutation({ mutationFn: () => postBillingRefresh({}), onSettled: reload });
  const manageMut = useMutation({
    mutationFn: (input: ManageInput) => postBillingManage(input),
    onSuccess: (r) => {
      if (r.message) toast.success(r.message);
      setConfirm(null);
      reload();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Something went wrong"),
  });

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "BILLING_DONE") return;
      setWaiting(false);
      if (e.data.result === "success") toast.success("You're subscribed. Thanks!");
      if (e.data.result === "card") toast.success("Card updated");
      refresh.mutate();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => {
      if (popupRef.current?.closed) {
        setWaiting(false);
        refresh.mutate();
      }
    }, 800);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  // Stripe pages can't load inside the app, so they open in a window of their own.
  const openStripe = async (get: () => Promise<{ url?: string }>) => {
    const popup = window.open("", "lsp-billing", "width=560,height=780");
    if (!popup) return toast.error("Your browser blocked the Stripe window. Allow pop-ups and try again.");
    popupRef.current = popup;
    popup.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px;color:#51637A">Opening Stripe…</p>';
    setWaiting(true);
    try {
      const { url } = await get();
      if (!url) throw new Error("Stripe didn't return a page to open");
      popup.location.href = url;
    } catch (e) {
      popup.close();
      setWaiting(false);
      toast.error(e instanceof Error ? e.message : "Couldn't open Stripe");
    }
  };
  const subscribe = (plan: PlanKey) => openStripe(() => postBillingCheckout({ plan, origin: window.location.origin }));
  const portal = () => openStripe(() => postBillingPortal({ origin: window.location.origin }));
  const updateCard = () => openStripe(() => postBillingManage({ action: "card", origin: window.location.origin }));
  const scrollToPlans = () => plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const subscribed = !!b && (b.status === "active" || b.status === "past_due");
  const current = subscribed ? b!.subscribedPlan : null;
  const busy = waiting || manageMut.isPending;

  const heroTitle = !b
    ? ""
    : b.status === "trial"
      ? "Team trial"
      : b.status === "expired"
        ? "No active plan"
        : b.status === "comp"
          ? "Team (complimentary)"
          : `${PLANS[b.plan].name} plan`;

  // Rough prorated upgrade cost for the rest of the current period (Stripe calculates the exact figure).
  const upgradeEstimate = (plan: PlanKey) => {
    if (!b || !current || !b.currentPeriodEnd) return null;
    const diff = PLANS[plan].price - PLANS[current].price;
    const left = daysUntil(b.currentPeriodEnd);
    return Math.max(0, Math.round((diff * Math.min(left, 31)) / 30));
  };
  const downgradeBlockers = (plan: PlanKey) => {
    if (!b) return [];
    const p = PLANS[plan];
    const out: string[] = [];
    if (b.jobsThisMonth > p.jobsPerMonth) out.push(`${b.jobsThisMonth} jobs scheduled this month (${p.name} allows ${p.jobsPerMonth})`);
    if (b.officeUsed > p.officeSeats) out.push(`${b.officeUsed} office logins (${p.name} allows ${p.officeSeats})`);
    if (b.crewUsed > p.crewSeats) out.push(`${b.crewUsed} crew logins (${p.name} allows ${p.crewSeats})`);
    return out;
  };

  const confirmPlan = confirm?.kind === "change" ? confirm.plan : null;
  const isUpgrade = !!confirmPlan && !!current && PLANS[confirmPlan].price > PLANS[current].price;
  const blockers = confirmPlan && !isUpgrade ? downgradeBlockers(confirmPlan) : [];
  const detailsDirty = !!ov?.details && JSON.stringify(details) !== JSON.stringify(ov.details);

  return (
    <div>
      <Helmet>
        <title>Plan & billing · Local Service Pro</title>
      </Helmet>
      <PageHeader back="/settings" title="Plan & billing" subtitle="Your Home Service Ops subscription" />
      <div className={styles.pad}>
        {!b ? (
          <>
            <Skeleton className={styles.skelHero} />
            <Skeleton className={styles.skel} />
          </>
        ) : (
          <>
            {/* ---------- current plan ---------- */}
            <section className={styles.hero}>
              <div className={styles.heroMain}>
                <span className={`${styles.pill} ${styles[`pill_${b.status}`]}`}>
                  {b.cancelAtPeriodEnd && b.status === "active" ? "Cancelling" : statusLabel(b.status)}
                </span>
                <h2 className={styles.heroTitle}>{heroTitle}</h2>
                <p className={styles.heroNote}>
                  {b.status === "trial" &&
                    `${daysUntil(b.trialEndsAt)} days left — ends ${fmtDate(b.trialEndsAt)}. You have everything in Team until then. Pick a plan any time; you won't be charged until the trial ends.`}
                  {b.status === "comp" && "This business is on a complimentary Team plan from Local Service Pro."}
                  {b.status === "active" &&
                    (b.cancelAtPeriodEnd
                      ? `Your plan ends on ${fmtDate(b.currentPeriodEnd)}. Resume any time before then to keep it.`
                      : `Renews automatically on ${fmtDate(b.currentPeriodEnd)}.`)}
                  {b.status === "past_due" && "Your last payment didn't go through. Update your card to keep access."}
                  {b.status === "expired" && "Your trial has ended. Everything is still here, but it's read-only until you choose a plan."}
                </p>
                {owner && (
                  <div className={styles.heroActions}>
                    {b.status === "past_due" && (
                      <Button onClick={updateCard} disabled={busy}>
                        <CreditCard size={16} /> Update card
                      </Button>
                    )}
                    {(b.status === "trial" || b.status === "expired") && (
                      <Button onClick={scrollToPlans} disabled={!b.stripeReady}>
                        <Sparkles size={16} /> Choose a plan
                      </Button>
                    )}
                    {b.status === "active" && !b.cancelAtPeriodEnd && (
                      <Button onClick={scrollToPlans} className={styles.heroBtn}>
                        Change plan
                      </Button>
                    )}
                    {b.status === "active" && b.cancelAtPeriodEnd && (
                      <Button onClick={() => manageMut.mutate({ action: "resume" })} disabled={busy}>
                        <RotateCcw size={16} /> Resume subscription
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className={styles.heroSide}>
                {subscribed ? (
                  <>
                    <div className={styles.heroPrice}>
                      ${PLANS[b.plan].price}
                      <span>/month + GST</span>
                    </div>
                    {ov?.nextCharge ? (
                      <div className={styles.heroNext}>
                        {ov.nextCharge.amount > 0 ? (
                          <>
                            Next payment <b>{money(ov.nextCharge.amount)}</b> on {fmtDate(ov.nextCharge.date)}
                          </>
                        ) : (
                          <>Your credit covers the next bill on {fmtDate(ov.nextCharge.date)}</>
                        )}
                      </div>
                    ) : b.cancelAtPeriodEnd ? (
                      <div className={styles.heroNext}>No further payments</div>
                    ) : null}
                  </>
                ) : b.status === "trial" ? (
                  <div className={styles.heroCount}>
                    <b>{daysUntil(b.trialEndsAt)}</b>
                    <span>days left</span>
                  </div>
                ) : null}
              </div>
            </section>

            {!b.stripeReady && <p className={styles.warnNote}>Billing isn't set up for this app yet.</p>}
            {!owner && <p className={styles.muted}>Only the business owner can change the plan or billing details.</p>}

            <div className={styles.grid}>
              {/* ---------- usage ---------- */}
              <section className={styles.card}>
                <SectionLabel>This month's usage</SectionLabel>
                <div className={styles.meters}>
                  <Meter label="Scheduled jobs" used={b.jobsThisMonth} limit={b.jobLimit} />
                  <Meter label="Office logins" used={b.officeUsed} limit={PLANS[b.plan].officeSeats} />
                  <Meter label="Crew logins" used={b.crewUsed} limit={PLANS[b.plan].crewSeats} />
                </div>
                <p className={styles.muted}>A job counts once it's scheduled for a date this month. Requests and quotes are free.</p>
              </section>

              {/* ---------- payment method ---------- */}
              {owner && (
                <section className={styles.card}>
                  <SectionLabel>Payment method</SectionLabel>
                  {ovLoading ? (
                    <Skeleton className={styles.cardSkel} />
                  ) : ov?.card ? (
                    <div className={styles.cc}>
                      <div className={styles.ccIcon}>
                        <CreditCard size={20} />
                      </div>
                      <div className={styles.ccText}>
                        <b>
                          {BRAND[ov.card.brand] ?? ov.card.brand} •••• {ov.card.last4}
                        </b>
                        <small>
                          Expires {String(ov.card.expMonth).padStart(2, "0")}/{String(ov.card.expYear).slice(-2)}
                        </small>
                      </div>
                    </div>
                  ) : (
                    <p className={styles.empty}>
                      {b.hasCustomer ? "No card on file yet." : "You'll add a card when you choose a plan."}
                    </p>
                  )}
                  {b.hasCustomer && (
                    <Button variant="outline" onClick={updateCard} disabled={busy || !b.stripeReady}>
                      <CreditCard size={16} /> {ov?.card ? "Replace card" : "Add a card"}
                    </Button>
                  )}
                  <p className={styles.muted}>Cards are stored securely by Stripe. We never see the full number.</p>
                </section>
              )}
            </div>

            {/* ---------- plans ---------- */}
            {b.status !== "comp" && (
              <div ref={plansRef} className={styles.plansWrap}>
                <SectionLabel>{subscribed ? "Change plan" : "Choose a plan"}</SectionLabel>
                <div className={styles.plans}>
                  {PLAN_ORDER.map((k) => {
                    const p = PLANS[k];
                    const isCurrent = current === k;
                    const up = !!current && p.price > PLANS[current].price;
                    return (
                      <div key={k} className={`${styles.plan} ${isCurrent ? styles.planCurrent : k === "team" && !current ? styles.featured : ""}`}>
                        {isCurrent ? (
                          <span className={`${styles.tag} ${styles.tagCurrent}`}>Your plan</span>
                        ) : (
                          k === "team" && !current && <span className={styles.tag}>Most popular</span>
                        )}
                        <div className={styles.planHead}>
                          <b>{p.name}</b>
                          <span className={styles.planPrice}>
                            ${p.price}
                            <small>/month + GST</small>
                          </span>
                        </div>
                        <ul>
                          {p.features.map((f) => (
                            <li key={f}>
                              <Check size={14} /> {f}
                            </li>
                          ))}
                        </ul>
                        {!owner ? null : isCurrent ? (
                          <Button variant="secondary" disabled>
                            <Check size={16} /> Current plan
                          </Button>
                        ) : subscribed ? (
                          <Button
                            variant={up ? "primary" : "outline"}
                            onClick={() => setConfirm({ kind: "change", plan: k })}
                            disabled={busy || !b.stripeReady || b.cancelAtPeriodEnd}
                          >
                            {up ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />} {up ? "Upgrade" : "Downgrade"} to {p.name}
                          </Button>
                        ) : (
                          <Button variant={k === "team" ? "primary" : "outline"} onClick={() => subscribe(k)} disabled={busy || !b.stripeReady}>
                            {waiting ? "Waiting for Stripe…" : `Choose ${p.name}`}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {subscribed && b.cancelAtPeriodEnd && <p className={styles.muted}>Resume your subscription to change plans.</p>}
                <p className={styles.muted}>Prices in AUD. Upgrades apply straight away; downgrades apply straight away with unused time credited to your next invoice.</p>
              </div>
            )}

            {owner && b.hasCustomer && (
              <div className={styles.grid}>
                {/* ---------- billing details ---------- */}
                <section className={styles.card}>
                  <SectionLabel>Billing details</SectionLabel>
                  {ovLoading ? (
                    <Skeleton className={styles.formSkel} />
                  ) : (
                    <form
                      className={styles.form}
                      onSubmit={(e) => {
                        e.preventDefault();
                        manageMut.mutate({ action: "details", ...details });
                      }}
                    >
                      <label className={`${styles.field} ${styles.full}`}>
                        <span>Business name on invoices</span>
                        <Input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
                      </label>
                      <label className={`${styles.field} ${styles.full}`}>
                        <span>Billing email (receipts go here)</span>
                        <Input type="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} />
                      </label>
                      <label className={`${styles.field} ${styles.full}`}>
                        <span>Street address</span>
                        <Input value={details.line1} onChange={(e) => setDetails({ ...details, line1: e.target.value })} />
                      </label>
                      <label className={styles.field}>
                        <span>Suburb</span>
                        <Input value={details.city} onChange={(e) => setDetails({ ...details, city: e.target.value })} />
                      </label>
                      <div className={styles.pair}>
                        <label className={styles.field}>
                          <span>State</span>
                          <Input value={details.state} onChange={(e) => setDetails({ ...details, state: e.target.value })} placeholder="NSW" />
                        </label>
                        <label className={styles.field}>
                          <span>Postcode</span>
                          <Input inputMode="numeric" value={details.postcode} onChange={(e) => setDetails({ ...details, postcode: e.target.value })} />
                        </label>
                      </div>
                      <Button type="submit" className={styles.full} disabled={!detailsDirty || busy}>
                        {manageMut.isPending && manageMut.variables?.action === "details" ? "Saving…" : "Save billing details"}
                      </Button>
                    </form>
                  )}
                </section>

                {/* ---------- invoices ---------- */}
                <section className={styles.card}>
                  <SectionLabel>Invoices</SectionLabel>
                  {ovLoading ? (
                    <Skeleton className={styles.formSkel} />
                  ) : ov?.invoices.length ? (
                    <div className={styles.invoices}>
                      {ov.invoices.map((i) => (
                        <div key={i.id} className={styles.inv}>
                          <div className={styles.invIcon}>
                            <FileText size={16} />
                          </div>
                          <div className={styles.invText}>
                            <b>{fmtDate(i.date)}</b>
                            <small>{i.number}</small>
                          </div>
                          <span className={`${styles.invStatus} ${styles[`inv_${i.status}`] ?? ""}`}>
                            {i.status === "paid" ? "Paid" : i.status === "open" ? "Due" : i.status === "void" ? "Void" : i.status}
                          </span>
                          <b className={styles.invAmt}>{money(i.total)}</b>
                          <div className={styles.invLinks}>
                            {i.url && (
                              <a href={i.url} target="_blank" rel="noreferrer" title={i.status === "open" ? "View and pay" : "View invoice"}>
                                <ExternalLink size={15} />
                              </a>
                            )}
                            {i.pdf && (
                              <a href={i.pdf} target="_blank" rel="noreferrer" title="Download PDF">
                                <Download size={15} />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.empty}>No invoices yet. They'll appear here after your first payment.</p>
                  )}
                </section>
              </div>
            )}

            {/* ---------- cancel ---------- */}
            {owner && b.status === "active" && !b.cancelAtPeriodEnd && (
              <section className={styles.cancelRow}>
                <div>
                  <b>Cancel subscription</b>
                  <small>You keep access until {fmtDate(b.currentPeriodEnd)}. Your data stays safe and you can come back any time.</small>
                </div>
                <Button variant="outline" className={styles.cancelBtn} onClick={() => setConfirm({ kind: "cancel" })} disabled={busy}>
                  Cancel plan
                </Button>
              </section>
            )}

            {owner && b.hasCustomer && (
              <button className={styles.portalLink} onClick={portal} disabled={busy}>
                Open the Stripe billing portal <ExternalLink size={13} />
              </button>
            )}
          </>
        )}
      </div>

      {/* ---------- confirmations ---------- */}
      <BottomSheet
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm?.kind === "cancel"
            ? "Cancel your subscription?"
            : confirmPlan
              ? `${isUpgrade ? "Upgrade" : "Downgrade"} to ${PLANS[confirmPlan].name}?`
              : ""
        }
        footer={
          <div className={styles.sheetBtns}>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              {confirm?.kind === "cancel" ? "Keep my plan" : "Not now"}
            </Button>
            {confirm?.kind === "cancel" ? (
              <Button variant="destructive" onClick={() => manageMut.mutate({ action: "cancel" })} disabled={manageMut.isPending}>
                {manageMut.isPending ? "Cancelling…" : "Cancel at period end"}
              </Button>
            ) : confirmPlan ? (
              <Button
                onClick={() => manageMut.mutate({ action: "change_plan", plan: confirmPlan })}
                disabled={manageMut.isPending || blockers.length > 0}
              >
                {manageMut.isPending ? "Updating…" : isUpgrade ? `Upgrade to ${PLANS[confirmPlan].name}` : `Switch to ${PLANS[confirmPlan].name}`}
              </Button>
            ) : null}
          </div>
        }
      >
        {b && confirm?.kind === "cancel" && (
          <div className={styles.sheetBody}>
            <p>
              Your plan stays active until <b>{fmtDate(b.currentPeriodEnd)}</b>, and you won't be charged again. After that the app becomes
              read-only; nothing is deleted.
            </p>
            <p>You can resume any time before then with one click.</p>
          </div>
        )}
        {b && confirmPlan && (
          <div className={styles.sheetBody}>
            <div className={styles.compare}>
              <div>
                <small>Now</small>
                <b>{current ? PLANS[current].name : "—"}</b>
                <span>{current ? `$${PLANS[current].price}/mo` : ""}</span>
              </div>
              <span className={styles.compareArrow}>→</span>
              <div className={styles.compareNew}>
                <small>New</small>
                <b>{PLANS[confirmPlan].name}</b>
                <span>${PLANS[confirmPlan].price}/mo</span>
              </div>
            </div>
            {isUpgrade ? (
              <>
                <p>
                  Team features switch on straight away: {PLANS[confirmPlan].jobsPerMonth} jobs a month, {PLANS[confirmPlan].officeSeats} office and{" "}
                  {PLANS[confirmPlan].crewSeats} crew logins, and LeadConnector sync.
                </p>
                <p>
                  {upgradeEstimate(confirmPlan) != null
                    ? `Today you'll be charged about $${upgradeEstimate(confirmPlan)} + GST for the rest of this billing period, then $${PLANS[confirmPlan].price}/month + GST from ${fmtDate(b.currentPeriodEnd)}.`
                    : `From your next bill you'll pay $${PLANS[confirmPlan].price}/month + GST.`}
                </p>
              </>
            ) : blockers.length ? (
              <div className={styles.blocker}>
                <b>Remove a few things first</b>
                <ul>
                  {blockers.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <p>
                  {PLANS[confirmPlan].name} includes {PLANS[confirmPlan].jobsPerMonth} scheduled jobs a month and {PLANS[confirmPlan].officeSeats} owner +{" "}
                  {PLANS[confirmPlan].crewSeats} crew logins.
                  {PLANS[confirmPlan].leadConnector ? "" : " LeadConnector sync pauses on this plan."}
                </p>
                <p>The change is immediate. Unused time on your current plan is credited to your next invoice.</p>
              </>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

