import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, MapPin, Navigation, Phone, Route as RouteIcon, ExternalLink, Clock, Home, Sparkles, X, TriangleAlert, Loader2 } from "lucide-react";
import { getDispatchDay, type DispatchJob, type OutputType as DayData } from "../endpoints/dispatch/day_GET.schema";
import { postDispatchApply } from "../endpoints/dispatch/apply_POST.schema";
import { postDispatchDepot } from "../endpoints/dispatch/depot_POST.schema";
import { opsFormat } from "../helpers/opsFormat";
import { pricing } from "../helpers/pricing";
import { formatTime, parseTime, planRoutes, routeLinks, type Plan, type Route } from "../helpers/routePlanner";
import { OPS_QUERY_KEY } from "../helpers/useOpsData";
import { DispatchMap, type MapLine, type MapPin as Pin } from "../components/DispatchMap";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/Button";
import { AddressInput } from "../components/AddressInput";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { Skeleton } from "../components/Skeleton";
import styles from "./dispatch.module.css";

const UNASSIGNED = "#5A7189";
const REQUEST = "#0C9BD6";
const PER_JOB = [30, 45, 60, 90, 120, 180];
const byTime = (a: DispatchJob, b: DispatchJob) => (parseTime(a.scheduledTime) ?? 24 * 60) - (parseTime(b.scheduledTime) ?? 24 * 60) || a.id - b.id;
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")} min` : `${Math.round(m)} min`);
const fmtKm = (k: number) => `${k < 10 ? k.toFixed(1) : Math.round(k)} km`;
const prefsKey = "hso.dispatch.prefs";
type Prefs = { startTime: string; minutesPerJob: number; returnToDepot: boolean };
const loadPrefs = (): Prefs => {
  try {
    return { startTime: "7:30 AM", minutesPerJob: 60, returnToDepot: true, ...JSON.parse(localStorage.getItem(prefsKey) || "{}") };
  } catch {
    return { startTime: "7:30 AM", minutesPerJob: 60, returnToDepot: true };
  }
};

export default function DispatchPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : opsFormat.todayISO();
  const setDate = (d: string) => {
    setParams(d === opsFormat.todayISO() ? {} : { date: d }, { replace: true });
    setSelectedId(null);
    setPlan(null);
  };

  const [hidden, setHidden] = useState<Set<string>>(() => new Set(["requests"]));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const mapColRef = useRef<HTMLDivElement>(null);
  // From the list: select the job and, on a phone where the map sits above the list, bring the map into view.
  const pickFromList = (id: number) => {
    setSelectedId(id);
    const el = mapColRef.current;
    if (el && window.matchMedia("(max-width: 1000px)").matches && el.getBoundingClientRect().bottom < 120) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const [tab, setTab] = useState<"jobs" | "routes">("jobs");
  const [showRoutes, setShowRoutes] = useState(true);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const setPrefs = (p: Partial<Prefs>) =>
    setPrefsState((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(prefsKey, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  const [assignUnassigned, setAssignUnassigned] = useState(false);
  const [crewPick, setCrewPick] = useState<Set<number> | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [editDepot, setEditDepot] = useState(false);
  const [depotDraft, setDepotDraft] = useState("");

  const day = useQuery({
    queryKey: ["dispatch", date],
    queryFn: () => getDispatchDay({ date }),
    // Addresses still being placed: ask again shortly.
    refetchInterval: (q) => ((q.state.data as DayData | undefined)?.pending ? 4000 : false),
  });
  const data = day.data;
  const crew = data?.crew ?? [];
  const crewById = useMemo(() => new Map(crew.map((c) => [c.id, c])), [crew]);
  const colorOf = (sid: number | null) => (sid != null ? crewById.get(sid)?.color || UNASSIGNED : UNASSIGNED);
  const nameOf = (sid: number | null) => (sid != null ? crewById.get(sid)?.name ?? "Crew" : "Unassigned");
  const jobs = data?.jobs ?? [];
  const jobById = useMemo(() => new Map([...(data?.jobs ?? []), ...(data?.requests ?? [])].map((j) => [j.id, j])), [data]);
  const depot = data?.depot && data.depot.lat != null && data.depot.lng != null ? { lat: data.depot.lat, lng: data.depot.lng } : null;

  // Crew who have work today, for the route planner's default.
  const busyCrew = useMemo(() => [...new Set(jobs.map((j) => j.staffId).filter((s): s is number => s != null))], [jobs]);
  const plannedCrew = crewPick ?? new Set(busyCrew);
  useEffect(() => setCrewPick(null), [date]);

  const keyOf = (j: DispatchJob, request = false) => (request ? "requests" : j.staffId != null ? `crew:${j.staffId}` : "unassigned");
  const toggle = (k: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // Route order and new times: from the plan when there is one, else by booked time.
  const routeOf = useMemo(() => {
    const m = new Map<number, { pos: number; time?: string; staffId: number | null }>();
    if (plan) {
      for (const r of plan.routes) r.stops.forEach((s, i) => m.set(s.jobId, { pos: i + 1, time: formatTime(s.arriveMin), staffId: r.staffId }));
    } else {
      const groups = new Map<number, DispatchJob[]>();
      for (const j of jobs) if (j.staffId != null) groups.set(j.staffId, [...(groups.get(j.staffId) ?? []), j]);
      for (const [sid, list] of groups) [...list].sort(byTime).forEach((j, i) => m.set(j.id, { pos: i + 1, staffId: sid }));
    }
    return m;
  }, [plan, jobs]);
  const staffAfter = (j: DispatchJob) => (plan && routeOf.has(j.id) ? routeOf.get(j.id)!.staffId : j.staffId);

  const pins: Pin[] = useMemo(() => {
    const out: Pin[] = [];
    for (const j of jobs) {
      if (j.lat == null || j.lng == null) continue;
      const sid = staffAfter(j);
      const k = sid != null ? `crew:${sid}` : "unassigned";
      if (hidden.has(k)) continue;
      out.push({ id: j.id, lat: j.lat, lng: j.lng, color: colorOf(sid), label: String(routeOf.get(j.id)?.pos ?? ""), title: `${j.customer} · ${j.address}` });
    }
    if (!hidden.has("requests"))
      for (const j of data?.requests ?? []) if (j.lat != null && j.lng != null) out.push({ id: j.id, lat: j.lat, lng: j.lng, color: REQUEST, label: "?", hollow: true, title: `Request: ${j.customer}` });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, data, hidden, routeOf, crewById, plan]);

  const lines: MapLine[] = useMemo(() => {
    if (!showRoutes) return [];
    const at = (id: number) => {
      const j = jobById.get(id);
      return j && j.lat != null && j.lng != null ? ([j.lat, j.lng] as [number, number]) : null;
    };
    const build = (r: Route, dashed: boolean): MapLine | null => {
      if (hidden.has(`crew:${r.staffId}`)) return null;
      const pts = r.stops.map((s) => at(s.jobId)).filter((p): p is [number, number] => !!p);
      if (!pts.length) return null;
      const d: [number, number] | null = depot ? [depot.lat, depot.lng] : null;
      const points = [...(d ? [d] : []), ...pts, ...(d && prefs.returnToDepot ? [d] : [])];
      return { key: `${dashed ? "c" : "p"}${r.staffId}`, color: colorOf(r.staffId), points, dashed };
    };
    if (plan) return plan.routes.map((r) => build(r, false)).filter((l): l is MapLine => !!l);
    // Current routes, dashed, in booked-time order.
    const current = planRoutes(
      jobs.map((j) => ({ id: j.id, at: j.lat != null && j.lng != null ? { lat: j.lat, lng: j.lng } : null, staffId: j.staffId, time: j.scheduledTime })),
      { depot, startMin: 0, minutesPerJob: 0, returnToDepot: prefs.returnToDepot, crewIds: busyCrew, assignUnassigned: false },
    ).current;
    return current.map((r) => build(r, true)).filter((l): l is MapLine => !!l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoutes, plan, jobs, hidden, depot, prefs.returnToDepot, busyCrew, crewById]);

  const optimise = () => {
    const ids = [...plannedCrew];
    if (!ids.length) return toast.error("Pick at least one crew member to plan routes for.");
    const start = parseTime(prefs.startTime) ?? 7.5 * 60;
    const p = planRoutes(
      jobs.map((j) => ({ id: j.id, at: j.lat != null && j.lng != null ? { lat: j.lat, lng: j.lng } : null, staffId: j.staffId, time: j.scheduledTime })),
      { depot, startMin: start, minutesPerJob: prefs.minutesPerJob, returnToDepot: prefs.returnToDepot, crewIds: ids, assignUnassigned },
    );
    setPlan(p);
    setTab("routes");
  };

  // What applying the plan would change.
  const changes = useMemo(() => {
    if (!plan) return [];
    const out: { jobId: number; staffId: number | null; time: string }[] = [];
    for (const r of plan.routes)
      for (const s of r.stops) {
        const j = jobById.get(s.jobId);
        const time = formatTime(s.arriveMin);
        if (j && (j.staffId !== r.staffId || j.scheduledTime !== time)) out.push({ jobId: s.jobId, staffId: r.staffId, time });
      }
    return out;
  }, [plan, jobById]);

  const apply = useMutation({
    mutationFn: () => postDispatchApply({ date, changes }),
    onSuccess: (r) => {
      toast.success(`Routes saved: ${r.retimed} new time${r.retimed === 1 ? "" : "s"}${r.reassigned ? `, ${r.reassigned} job${r.reassigned === 1 ? "" : "s"} assigned` : ""}. Customers get reminders with the new times.`);
      setPlan(null);
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ["dispatch", date] });
      qc.invalidateQueries({ queryKey: OPS_QUERY_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDepot = useMutation({
    mutationFn: (address: string) => postDispatchDepot({ address }),
    onSuccess: () => {
      setEditDepot(false);
      setPlan(null);
      qc.invalidateQueries({ queryKey: ["dispatch", date] });
      toast.success("Yard saved. Routes start and end there.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = selectedId != null ? jobById.get(selectedId) ?? null : null;
  const isRequest = selected ? !jobs.some((j) => j.id === selected.id) : false;
  const unlocated = jobs.filter((j) => j.lat == null);
  const notFound = unlocated.filter((j) => j.notFound);
  const fitKey = `${date}:${pins.length > 0}`;

  const shift = (days: number) => setDate(opsFormat.addDays(date, days));
  const groups = [
    ...crew.map((c) => ({ key: `crew:${c.id}`, label: c.name, color: c.color || UNASSIGNED, list: jobs.filter((j) => j.staffId === c.id).sort(byTime) })),
    { key: "unassigned", label: "Unassigned", color: UNASSIGNED, list: jobs.filter((j) => j.staffId == null).sort(byTime) },
  ];

  const linksFor = (r: Route) =>
    routeLinks(
      r.stops.map((s) => jobById.get(s.jobId)?.address ?? "").filter(Boolean),
      data?.depot?.address,
      prefs.returnToDepot ? data?.depot?.address : undefined,
    );

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Dispatch · Home Service Ops</title>
      </Helmet>
      <PageHeader title="Dispatch" subtitle="Where today's jobs are, and the best route for each crew member" />

      <div className={styles.toolbar}>
        <div className={styles.dateNav}>
          <Button variant="outline" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous day">
            <ChevronLeft size={16} />
          </Button>
          <input type="date" className={styles.dateInput} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Day" />
          <Button variant="outline" size="icon-sm" onClick={() => shift(1)} aria-label="Next day">
            <ChevronRight size={16} />
          </Button>
          {date !== opsFormat.todayISO() && (
            <Button variant="ghost" size="sm" onClick={() => setDate(opsFormat.todayISO())}>
              Today
            </Button>
          )}
          <span className={styles.dayLabel}>{opsFormat.longDate(date)}</span>
        </div>
        <div className={styles.chips} role="group" aria-label="Show on the map">
          {groups
            .filter((g) => g.list.length || g.key !== "unassigned")
            .map((g) => (
              <button key={g.key} type="button" className={`${styles.chip} ${hidden.has(g.key) ? styles.chipOff : ""}`} onClick={() => toggle(g.key)} aria-pressed={!hidden.has(g.key)}>
                <i style={{ background: g.color }} />
                {g.label}
                <b>{g.list.length}</b>
              </button>
            ))}
          <button type="button" className={`${styles.chip} ${hidden.has("requests") ? styles.chipOff : ""}`} onClick={() => toggle("requests")} aria-pressed={!hidden.has("requests")}>
            <i className={styles.chipHollow} style={{ borderColor: REQUEST }} />
            Unbooked requests
            <b>{data?.requests.length ?? 0}</b>
          </button>
          <label className={styles.routeToggle}>
            <input type="checkbox" checked={showRoutes} onChange={(e) => setShowRoutes(e.target.checked)} />
            Show routes
          </label>
        </div>
      </div>

      {(data?.pending ?? 0) > 0 && (
        <div className={styles.note}>
          <Loader2 size={15} className={styles.spin} /> Placing {data!.pending} address{data!.pending === 1 ? "" : "es"} on the map…
        </div>
      )}
      {notFound.length > 0 && (
        <div className={`${styles.note} ${styles.noteWarn}`}>
          <TriangleAlert size={15} />
          <span>
            {notFound.length} job{notFound.length === 1 ? "" : "s"} couldn't be placed on the map:{" "}
            {notFound.map((j, i) => (
              <span key={j.id}>
                {i > 0 && ", "}
                <Link to={`/jobs/${j.id}`}>{j.customer || `#${j.num}`}</Link> ({j.address || "no address"})
              </span>
            ))}
            . Check the street and suburb.
          </span>
        </div>
      )}

      <div className={styles.body}>
        <div className={styles.mapCol} ref={mapColRef}>
          {day.isLoading ? (
            <Skeleton className={styles.mapSkel} />
          ) : (
            <DispatchMap pins={pins} lines={lines} depot={depot} selectedId={selectedId} onSelect={setSelectedId} fitKey={fitKey} className={styles.map} />
          )}
          {!day.isLoading && jobs.length === 0 && (
            <div className={styles.mapEmpty}>
              <MapPin size={18} /> No jobs booked on this day.
            </div>
          )}
          {selected && (
            <div className={styles.detail}>
              <button type="button" className={styles.detailClose} onClick={() => setSelectedId(null)} aria-label="Close">
                <X size={16} />
              </button>
              <div className={styles.detailTop}>
                <span className={styles.detailNum}>#{selected.num}</span>
                <StatusBadge status={selected.status} />
              </div>
              <h3>{selected.customer}</h3>
              <p className={styles.detailAddr}>
                <MapPin size={14} /> {selected.address || "No address"}
              </p>
              <dl className={styles.detailGrid}>
                <dt>When</dt>
                <dd>
                  {isRequest ? "Not booked yet" : selected.scheduledTime || "No time set"}
                  {plan && routeOf.get(selected.id)?.time && routeOf.get(selected.id)!.time !== selected.scheduledTime && (
                    <span className={styles.newTime}> → {routeOf.get(selected.id)!.time}</span>
                  )}
                </dd>
                <dt>Crew</dt>
                <dd>
                  <i className={styles.dot} style={{ background: colorOf(staffAfter(selected)) }} /> {nameOf(staffAfter(selected))}
                  {plan && staffAfter(selected) !== selected.staffId && <span className={styles.newTime}> (new)</span>}
                </dd>
                <dt>Service</dt>
                <dd>{selected.service || "—"}</dd>
                <dt>Price</dt>
                <dd>{pricing.fmtMoney(selected.price)}</dd>
                {selected.notes && (
                  <>
                    <dt>Notes</dt>
                    <dd className={styles.notes}>{selected.notes}</dd>
                  </>
                )}
              </dl>
              <div className={styles.detailActions}>
                {selected.address && (
                  <Button asChild variant="outline" size="sm">
                    <a href={opsFormat.dirUrl(selected.address)} target="_blank" rel="noreferrer">
                      <Navigation size={14} /> Directions
                    </a>
                  </Button>
                )}
                {selected.phone && (
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:${selected.phone.replace(/\s/g, "")}`}>
                      <Phone size={14} /> Call
                    </a>
                  </Button>
                )}
                <Button asChild size="sm">
                  <Link to={`/jobs/${selected.id}`}>Open job</Link>
                </Button>
              </div>
            </div>
          )}
        </div>

        <aside className={styles.panel}>
          <div className={styles.tabs} role="tablist">
            <button type="button" role="tab" aria-selected={tab === "jobs"} className={tab === "jobs" ? styles.tabOn : ""} onClick={() => setTab("jobs")}>
              Jobs <b>{jobs.length}</b>
            </button>
            <button type="button" role="tab" aria-selected={tab === "routes"} className={tab === "routes" ? styles.tabOn : ""} onClick={() => setTab("routes")}>
              <RouteIcon size={14} /> Route optimisation
            </button>
          </div>

          {tab === "jobs" && (
            <div className={styles.list}>
              {day.isLoading && <Skeleton className={styles.listSkel} />}
              {groups
                .filter((g) => g.list.length)
                .map((g) => (
                  <section key={g.key} className={hidden.has(g.key) ? styles.groupOff : ""}>
                    <h4>
                      <i style={{ background: g.color }} /> {g.label} <span>{g.list.length} job{g.list.length === 1 ? "" : "s"}</span>
                    </h4>
                    {g.list.map((j) => (
                      <button key={j.id} type="button" className={`${styles.row} ${selectedId === j.id ? styles.rowOn : ""}`} onClick={() => pickFromList(j.id)}>
                        <span className={styles.rowNum} style={{ background: g.color }}>
                          {routeOf.get(j.id)?.pos ?? "•"}
                        </span>
                        <span className={styles.rowMain}>
                          <b>{j.customer}</b>
                          <small>{j.address || "No address"}</small>
                        </span>
                        <span className={styles.rowSide}>
                          <small>{j.scheduledTime || "—"}</small>
                          {j.lat == null && <em>{j.notFound ? "Not found" : "Locating"}</em>}
                        </span>
                      </button>
                    ))}
                  </section>
                ))}
              {!hidden.has("requests") && (data?.requests.length ?? 0) > 0 && (
                <section>
                  <h4>
                    <i className={styles.chipHollow} style={{ borderColor: REQUEST }} /> Unbooked requests <span>{data!.requests.length}</span>
                  </h4>
                  {data!.requests.map((j) => (
                    <button key={j.id} type="button" className={`${styles.row} ${selectedId === j.id ? styles.rowOn : ""}`} onClick={() => pickFromList(j.id)}>
                      <span className={`${styles.rowNum} ${styles.rowNumHollow}`}>?</span>
                      <span className={styles.rowMain}>
                        <b>{j.customer}</b>
                        <small>{j.address || "No address"}</small>
                      </span>
                      <span className={styles.rowSide}>
                        <StatusBadge status={j.status} />
                      </span>
                    </button>
                  ))}
                </section>
              )}
              {!day.isLoading && !jobs.length && <p className={styles.empty}>Nothing booked on {opsFormat.longDate(date)}. Pick another day above.</p>}
            </div>
          )}

          {tab === "routes" && (
            <div className={styles.routes}>
              <div className={styles.depotRow}>
                <Home size={15} />
                {editDepot ? (
                  <div className={styles.depotEdit}>
                    <AddressInput value={depotDraft} onChange={setDepotDraft} placeholder="Yard or office address" onEnter={() => saveDepot.mutate(depotDraft)} />
                    <div>
                      <Button size="sm" onClick={() => saveDepot.mutate(depotDraft)} disabled={saveDepot.isPending}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditDepot(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <span>
                    <b>Start and finish:</b> {data?.depot?.address || "No yard set. Routes start at the first job."}
                    {data?.depot?.isBusinessAddress && <small> (your business address)</small>}
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => {
                        setDepotDraft(data?.depot?.isBusinessAddress ? "" : data?.depot?.address ?? "");
                        setEditDepot(true);
                      }}
                    >
                      Change
                    </button>
                  </span>
                )}
              </div>

              <div className={styles.form}>
                <label>
                  Day starts
                  <select value={prefs.startTime} onChange={(e) => setPrefs({ startTime: e.target.value })}>
                    {opsFormat.TIME_SLOTS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Time per job
                  <select value={prefs.minutesPerJob} onChange={(e) => setPrefs({ minutesPerJob: Number(e.target.value) })}>
                    {PER_JOB.map((m) => (
                      <option key={m} value={m}>
                        {fmtMin(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.check}>
                  <input type="checkbox" checked={prefs.returnToDepot} onChange={(e) => setPrefs({ returnToDepot: e.target.checked })} /> Drive back to the yard at the end
                </label>
                <label className={styles.check}>
                  <input type="checkbox" checked={assignUnassigned} onChange={(e) => setAssignUnassigned(e.target.checked)} /> Share out the {jobs.filter((j) => j.staffId == null).length} unassigned job
                  {jobs.filter((j) => j.staffId == null).length === 1 ? "" : "s"}
                </label>
              </div>

              <div className={styles.crewPick}>
                <span>Plan routes for</span>
                {crew.map((c) => {
                  const on = plannedCrew.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`${styles.chip} ${on ? "" : styles.chipOff}`}
                      aria-pressed={on}
                      onClick={() => {
                        const n = new Set(plannedCrew);
                        if (on) n.delete(c.id);
                        else n.add(c.id);
                        setCrewPick(n);
                      }}
                    >
                      <i style={{ background: c.color || UNASSIGNED }} />
                      {c.name}
                      <b>{jobs.filter((j) => j.staffId === c.id).length}</b>
                    </button>
                  );
                })}
                {!crew.length && <small>Add crew members on the Crew page to plan routes.</small>}
              </div>

              <div className={styles.routeActions}>
                <Button onClick={optimise} disabled={!jobs.length || !crew.length}>
                  <Sparkles size={15} /> {plan ? "Optimise again" : "Optimise routes"}
                </Button>
                {plan && (
                  <Button variant="ghost" onClick={() => setPlan(null)}>
                    Discard
                  </Button>
                )}
              </div>

              {plan && (
                <>
                  {plan.unlocated.length > 0 && (
                    <p className={`${styles.note} ${styles.noteWarn}`}>
                      <TriangleAlert size={14} /> {plan.unlocated.length} job{plan.unlocated.length === 1 ? " isn't" : "s aren't"} on the map, so {plan.unlocated.length === 1 ? "it stays" : "they stay"} as booked.
                    </p>
                  )}
                  {plan.unassigned.length > 0 && (
                    <p className={styles.note}>
                      {plan.unassigned.length} unassigned job{plan.unassigned.length === 1 ? "" : "s"} left as they are. Tick "Share out" to give them to a crew member.
                    </p>
                  )}
                  {plan.routes.map((r) => {
                    const before = plan.current.find((c) => c.staffId === r.staffId);
                    const savedKm = before && before.stops.length ? before.km - r.km : 0;
                    const savedMin = before && before.stops.length ? before.driveMin - r.driveMin : 0;
                    const links = linksFor(r);
                    return (
                      <div key={r.staffId} className={styles.routeCard}>
                        <header>
                          <i style={{ background: colorOf(r.staffId) }} />
                          <b>{nameOf(r.staffId)}</b>
                          <span>
                            {r.stops.length} stop{r.stops.length === 1 ? "" : "s"}
                          </span>
                        </header>
                        {r.stops.length === 0 ? (
                          <p className={styles.empty}>No jobs on the map for {nameOf(r.staffId)} this day.</p>
                        ) : (
                          <>
                            <div className={styles.routeStats}>
                              <span>
                                <RouteIcon size={13} /> {fmtKm(r.km)}
                              </span>
                              <span>
                                <Clock size={13} /> {fmtMin(r.driveMin)} driving
                              </span>
                              <span>Done by {formatTime(r.finishMin)}</span>
                              {(savedKm > 0.5 || savedMin > 2) && (
                                <span className={styles.saved}>
                                  Saves {fmtKm(Math.max(0, savedKm))} · {fmtMin(Math.max(0, savedMin))}
                                </span>
                              )}
                            </div>
                            <ol className={styles.stops}>
                              {r.stops.map((s, i) => {
                                const j = jobById.get(s.jobId)!;
                                const t = formatTime(s.arriveMin);
                                return (
                                  <li key={s.jobId}>
                                    <button type="button" onClick={() => pickFromList(s.jobId)} className={selectedId === s.jobId ? styles.rowOn : ""}>
                                      <span className={styles.rowNum} style={{ background: colorOf(r.staffId) }}>
                                        {i + 1}
                                      </span>
                                      <span className={styles.rowMain}>
                                        <b>{j.customer}</b>
                                        <small>
                                          {s.driveMin ? `${fmtMin(s.driveMin)} drive · ` : ""}
                                          {j.address}
                                        </small>
                                      </span>
                                      <span className={styles.rowSide}>
                                        <b>{t}</b>
                                        {j.scheduledTime && j.scheduledTime !== t && <s>{j.scheduledTime}</s>}
                                        {j.staffId !== r.staffId && <em>{j.staffId == null ? "Assigned" : `From ${nameOf(j.staffId)}`}</em>}
                                      </span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ol>
                            {links.length > 0 && (
                              <div className={styles.links}>
                                {links.map((u, i) => (
                                  <a key={u} href={u} target="_blank" rel="noreferrer">
                                    <ExternalLink size={13} /> Open in Google Maps{links.length > 1 ? ` (part ${i + 1} of ${links.length})` : ""}
                                  </a>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div className={styles.applyBar}>
                    <span>
                      {changes.length ? `${changes.length} job${changes.length === 1 ? "" : "s"} change time or crew member.` : "This matches what's booked already."}
                    </span>
                    <Button onClick={() => setConfirm(true)} disabled={!changes.length}>
                      Apply routes
                    </Button>
                  </div>
                  <p className={styles.fine}>Drive times are estimates from distance. Google Maps gives turn-by-turn directions.</p>
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      <ConfirmSheet
        open={confirm}
        onOpenChange={setConfirm}
        title="Apply these routes?"
        body={`${changes.length} job${changes.length === 1 ? "" : "s"} get a new time or crew member for ${opsFormat.longDate(date)}. Their calendars update, and customers who were already reminded get a new reminder with the new time.`}
        confirmLabel="Apply routes"
        pending={apply.isPending}
        onConfirm={() => apply.mutate()}
      />
    </div>
  );
}
