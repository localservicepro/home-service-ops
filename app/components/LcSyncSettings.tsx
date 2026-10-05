import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle } from "lucide-react";
import type { OutputType as CrmStatus } from "../endpoints/crm/status_GET.schema";
import { getCrmPipelines } from "../endpoints/crm/pipelines_GET.schema";
import { postCrmSettings } from "../endpoints/crm/settings_POST.schema";
import { postCrmPull } from "../endpoints/crm/pull_POST.schema";
import { STAGE_KEYS, STAGE_LABELS, guessStageMap, type StageMap } from "../helpers/lcStages";
import { opsFormat } from "../helpers/opsFormat";
import { Button } from "./Button";
import { Switch } from "./Switch";
import { Skeleton } from "./Skeleton";
import styles from "./LcSyncSettings.module.css";

// Connected LeadConnector: choose the pipeline, match stages, and sync leads.
export function LcSyncSettings({ status, className }: { status: CrmStatus; className?: string }) {
  const qc = useQueryClient();
  const pipelinesQ = useQuery({ queryKey: ["crm", "pipelines"], queryFn: () => getCrmPipelines(), enabled: status.planAllows, retry: false });
  const [pipelineId, setPipelineId] = useState("");
  const [map, setMap] = useState<StageMap>({});
  const [importLeads, setImportLeads] = useState(true);
  const [pushNew, setPushNew] = useState(true);

  useEffect(() => {
    setPipelineId(status.pipelineId ?? "");
    setMap(status.stageMap ?? {});
    setImportLeads(status.importLeads);
    setPushNew(status.pushNew);
  }, [status.pipelineId, status.stageMap, status.importLeads, status.pushNew]);

  const pipelines = pipelinesQ.data?.pipelines ?? [];
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const pickPipeline = (id: string) => {
    setPipelineId(id);
    const p = pipelines.find((x) => x.id === id);
    setMap(p ? (id === status.pipelineId ? status.stageMap : guessStageMap(p.stages)) : {});
  };

  const dirty = useMemo(
    () =>
      pipelineId !== (status.pipelineId ?? "") ||
      JSON.stringify(map) !== JSON.stringify(status.stageMap ?? {}) ||
      importLeads !== status.importLeads ||
      pushNew !== status.pushNew,
    [pipelineId, map, importLeads, pushNew, status],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["crm", "status"] });
    qc.invalidateQueries({ queryKey: ["ops"] });
  };
  const save = useMutation({
    mutationFn: () => postCrmSettings({ pipelineId, stageMap: { ...map, new: map.new! }, importLeads, pushNew }),
    onSuccess: async () => {
      toast.success("LeadConnector sync saved");
      refresh();
      const r = await postCrmPull({ force: true }).catch(() => null);
      if (r?.imported) toast.success(`${r.imported} new lead${r.imported === 1 ? "" : "s"} brought in`);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
  });
  const pull = useMutation({
    mutationFn: () => postCrmPull({ force: true }),
    onSuccess: (r) => {
      if (r.error) toast.error(r.error);
      else toast.success(r.imported ? `${r.imported} new lead${r.imported === 1 ? "" : "s"} brought in` : "No new leads");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't sync"),
  });

  if (!status.planAllows) {
    return (
      <p className={`${styles.upsell} ${className ?? ""}`}>
        Syncing leads and pipeline stages is part of the Team plan. <Link to="/settings/billing">See plans</Link>
      </p>
    );
  }
  if (pipelinesQ.isLoading) return <Skeleton className={styles.skel} />;
  if (pipelinesQ.error) {
    return <p className={styles.error}><AlertTriangle size={14} /> Couldn't load your pipelines: {pipelinesQ.error instanceof Error ? pipelinesQ.error.message : "unknown error"}</p>;
  }
  if (!pipelines.length) return <p className={styles.muted}>This sub-account has no opportunity pipelines yet. Create one in LeadConnector, then come back here.</p>;

  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      <label className={styles.field}>
        <span>Pipeline</span>
        <select className={styles.select} value={pipelineId} onChange={(e) => pickPipeline(e.target.value)}>
          <option value="">Choose a pipeline…</option>
          {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      {pipeline && (
        <div className={styles.stages}>
          <div className={styles.stagesHead}>Match your stages</div>
          {STAGE_KEYS.map((k) => (
            <label key={k} className={styles.stageRow}>
              <span className={styles.stageText}>
                <b>{STAGE_LABELS[k].label}</b>
                <small>{STAGE_LABELS[k].hint}</small>
              </span>
              <select className={styles.select} value={map[k] ?? ""} onChange={(e) => setMap({ ...map, [k]: e.target.value || undefined })}>
                <option value="">{k === "new" ? "Choose…" : "Don't move"}</option>
                {pipeline.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      <div className={styles.toggle}>
        <span><b>Bring in new leads</b><small>New opportunities in this pipeline appear as job requests.</small></span>
        <Switch checked={importLeads} onCheckedChange={setImportLeads} aria-label="Bring in new leads" />
      </div>
      <div className={styles.toggle}>
        <span><b>Add app jobs to LeadConnector</b><small>Jobs and quotes you create in the app get a contact and opportunity (needs a phone or email).</small></span>
        <Switch checked={pushNew} onCheckedChange={setPushNew} aria-label="Add app jobs to LeadConnector" />
      </div>

      {dirty && (
        <Button onClick={() => save.mutate()} disabled={!pipelineId || !map.new || save.isPending}>
          {save.isPending ? "Saving…" : "Save sync settings"}
        </Button>
      )}

      {status.pipelineId && !dirty && (
        <>
          <div className={styles.status}>
            <span>
              {status.linkedLeads} linked opportunit{status.linkedLeads === 1 ? "y" : "ies"}
              {status.lastSyncAt ? ` · synced ${opsFormat.timeAgo(status.lastSyncAt)}` : ""}
            </span>
            <small>New leads arrive instantly by webhook, and are also checked each time the app is opened.</small>
          </div>
          {status.lastSyncError && <p className={styles.error}><AlertTriangle size={14} /> Last sync problem: {status.lastSyncError}</p>}
          <Button variant="outline" onClick={() => pull.mutate()} disabled={pull.isPending}>
            <RefreshCw size={15} className={pull.isPending ? styles.spin : ""} /> {pull.isPending ? "Checking…" : "Sync leads now"}
          </Button>
        </>
      )}
    </div>
  );
}
