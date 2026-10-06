import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Plus, Trash2, Zap } from "lucide-react";
import { useMe } from "../helpers/useMe";
import { useOpsData } from "../helpers/useOpsData";
import { TRADES, tradeByKey, type StarterService } from "../helpers/tradeTemplates";
import { opsFormat } from "../helpers/opsFormat";
import { PLANS } from "../helpers/plans";
import { postSettingsSave } from "../endpoints/settings/save_POST.schema";
import { postOnboardingApply } from "../endpoints/onboarding/apply_POST.schema";
import { postOnboardingComplete } from "../endpoints/onboarding/complete_POST.schema";
import { AuthLoadingState } from "../components/AuthLoadingState";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Chip } from "../components/Chip";
import { StripeCard } from "../components/StripeCard";
import { GoogleCalendarCard } from "../components/GoogleCalendarCard";
import { LeadConnectorCard } from "../components/LeadConnectorCard";
import styles from "./onboarding.module.css";

const STEPS = ["Your business", "Services & prices", "Your crew", "Connect"];
type Row = StarterService & { on: boolean };
type CrewRow = { name: string; phone: string; rate: string };

export default function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me, isLoading, authState } = useMe();
  const { data: ops } = useOpsData();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Step 1
  const [trade, setTrade] = useState("");
  const [biz, setBiz] = useState({ name: "", phone: "", abn: "", area: "" });
  // Step 2
  const [rows, setRows] = useState<Row[]>([]);
  // Step 3
  const [soloOp, setSoloOp] = useState(true);
  const [crew, setCrew] = useState<CrewRow[]>([{ name: "", phone: "", rate: "" }]);

  useEffect(() => {
    if (me && ops && !biz.name) {
      const b = ops.settings.business;
      setBiz({ name: b.name || me.businessName, phone: b.phone, abn: b.abn, area: b.area });
      if (me.trade) setTrade(me.trade);
    }
  }, [me, ops, biz.name]);

  if (authState.type === "unauthenticated") return <Navigate to="/login" replace />;
  if (isLoading || !me || !ops) return <AuthLoadingState title="Getting things ready" />;
  if (me.role !== "owner" || me.onboarded) return <Navigate to="/" replace />;

  const hasServices = ops.services.length > 0;
  const first = me.displayName.split(" ")[0];

  const pickTrade = (k: string) => {
    setTrade(k);
    setRows((tradeByKey(k)?.services ?? []).map((s) => ({ ...s, on: true })));
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ["ops"] });
      setStep((s) => s + 1);
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const saveBusiness = () =>
    run(async () => {
      await postSettingsSave({ business: { ...ops.settings.business, name: biz.name.trim(), phone: biz.phone.trim(), abn: biz.abn.trim(), area: biz.area.trim() } });
      await postOnboardingApply({ trade });
      if (!rows.length && !hasServices) setRows((tradeByKey(trade)?.services ?? []).map((s) => ({ ...s, on: true })));
    });
  const saveServices = () =>
    run(async () => {
      const chosen = rows.filter((r) => r.on && r.name.trim()).map(({ name, price, freq }) => ({ name: name.trim(), price: Number(price) || 0, freq }));
      if (chosen.length) await postOnboardingApply({ services: chosen });
    });
  const saveCrew = () =>
    run(async () => {
      const list = soloOp ? [] : crew.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), phone: c.phone.trim(), rate: Number(c.rate) || 0, rateType: "hour" as const, role: "Crew" }));
      if (list.length) await postOnboardingApply({ crew: list });
    });
  const finish = async () => {
    setBusy(true);
    try {
      await postOnboardingComplete({});
      await qc.invalidateQueries({ queryKey: ["account", "me"] });
      toast.success("You're all set!");
      navigate("/", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't finish setup");
      setBusy(false);
    }
  };

  const setRow = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const setCrewRow = (i: number, patch: Partial<CrewRow>) => setCrew((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <div className={styles.stage}>
      <Helmet><title>Set up · Local Service Pro</title></Helmet>
      <div className={styles.column}>
        <header className={styles.top}>
          <span className={styles.logo}><Zap size={15} fill="currentColor" strokeWidth={0} /></span>
          <span className={styles.brand}>Let's set up {biz.name || "your business"}</span>
        </header>
        <div className={styles.progress}>
          {STEPS.map((s, i) => (
            <div key={s} className={`${styles.stepDot} ${i < step ? styles.done : i === step ? styles.current : ""}`}>
              <span>{i < step ? <Check size={12} /> : i + 1}</span>
              <small>{s}</small>
            </div>
          ))}
        </div>

        <main className={styles.body}>
          {step === 0 && (
            <section className={styles.section}>
              <h1>Hi {first}, what do you do?</h1>
              <p className={styles.lead}>We'll pre-fill a starter price list for your trade. You can change everything later.</p>
              <div className={styles.chips}>
                {TRADES.map((t) => <Chip key={t.key} selected={trade === t.key} onClick={() => pickTrade(t.key)}>{t.label}</Chip>)}
              </div>
              <div className={styles.grid}>
                <label className={`${styles.field} ${styles.full}`}><span>Business name</span><Input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} /></label>
                <label className={styles.field}><span>Business phone</span><Input value={biz.phone} inputMode="tel" onChange={(e) => setBiz({ ...biz, phone: e.target.value })} placeholder="04xx xxx xxx" /></label>
                <label className={styles.field}><span>ABN (optional)</span><Input value={biz.abn} inputMode="numeric" onChange={(e) => setBiz({ ...biz, abn: e.target.value })} /></label>
                <label className={`${styles.field} ${styles.full}`}><span>Where do you work?</span><Input value={biz.area} onChange={(e) => setBiz({ ...biz, area: e.target.value })} placeholder="e.g. Hills District & North West Sydney" /></label>
              </div>
              <Button size="lg" onClick={saveBusiness} disabled={!trade || !biz.name.trim() || busy}>{busy ? "Saving…" : "Continue"}</Button>
            </section>
          )}

          {step === 1 && (
            <section className={styles.section}>
              <h1>Your services & prices</h1>
              {hasServices ? (
                <p className={styles.lead}>You already have {ops.services.length} services. You can edit them any time in Settings → Services & add-ons.</p>
              ) : (
                <>
                  <p className={styles.lead}>Untick anything you don't offer and set your own prices (ex GST). These are what you'll pick from when quoting.</p>
                  <div className={styles.list}>
                    {rows.map((r, i) => (
                      <div key={i} className={`${styles.svc} ${r.on ? "" : styles.off}`}>
                        <button className={`${styles.tick} ${r.on ? styles.ticked : ""}`} onClick={() => setRow(i, { on: !r.on })} aria-label={r.on ? "Remove" : "Include"}>
                          {r.on && <Check size={14} />}
                        </button>
                        <Input className={styles.svcName} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} />
                        <div className={styles.money}>
                          <span>$</span>
                          <Input value={String(r.price)} inputMode="decimal" onChange={(e) => setRow(i, { price: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" onClick={() => setRows((r) => [...r, { name: "", price: 0, freq: "One-time", on: true }])}><Plus size={15} /> Add a service</Button>
                </>
              )}
              <div className={styles.nav}>
                <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
                <Button size="lg" onClick={saveServices} disabled={busy}>{busy ? "Saving…" : "Continue"}</Button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className={styles.section}>
              <h1>Who does the work?</h1>
              <p className={styles.lead}>Add the people you send to jobs so you can assign work and track their hours.</p>
              <div className={styles.chips}>
                <Chip selected={soloOp} onClick={() => setSoloOp(true)}>Just me for now</Chip>
                <Chip selected={!soloOp} onClick={() => setSoloOp(false)}>I have crew</Chip>
              </div>
              {!soloOp && (
                <>
                  <div className={styles.list}>
                    {crew.map((c, i) => (
                      <div key={i} className={styles.crewRow}>
                        <span className={styles.avatar}>{c.name.trim() ? opsFormat.initials(c.name) : i + 1}</span>
                        <div className={styles.crewFields}>
                          <Input value={c.name} onChange={(e) => setCrewRow(i, { name: e.target.value })} placeholder="Name" />
                          <div className={styles.crewSub}>
                            <Input value={c.phone} inputMode="tel" onChange={(e) => setCrewRow(i, { phone: e.target.value })} placeholder="Mobile" />
                            <div className={styles.money}>
                              <span>$</span>
                              <Input value={c.rate} inputMode="decimal" onChange={(e) => setCrewRow(i, { rate: e.target.value.replace(/[^\d.]/g, "") })} placeholder="/hr" />
                            </div>
                          </div>
                        </div>
                        {crew.length > 1 && (
                          <button className={styles.iconBtn} onClick={() => setCrew((r) => r.filter((_, k) => k !== i))} aria-label="Remove"><Trash2 size={15} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" onClick={() => setCrew((r) => [...r, { name: "", phone: "", rate: "" }])}><Plus size={15} /> Add another</Button>
                  <p className={styles.hint}>
                    You can send each person their own app login from their crew profile. Your trial includes up to {PLANS.team.crewSeats} crew logins; Solo includes {PLANS.solo.crewSeats}.
                  </p>
                </>
              )}
              <div className={styles.nav}>
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button size="lg" onClick={saveCrew} disabled={busy}>{busy ? "Saving…" : "Continue"}</Button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className={styles.section}>
              <h1>Connect your tools</h1>
              <p className={styles.lead}>All optional. You can do these later in Settings.</p>
              <div className={styles.cards}>
                <StripeCard />
                <GoogleCalendarCard />
                {me.billing.plan === "team" && <LeadConnectorCard />}
              </div>
              <div className={styles.nav}>
                <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                <Button size="lg" onClick={finish} disabled={busy}>{busy ? "Finishing…" : "Finish setup"}</Button>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
