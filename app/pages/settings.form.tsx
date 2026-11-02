import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, ExternalLink, ImagePlus, Lock, Trash2 } from "lucide-react";
import { getLeadForm } from "../endpoints/leadform/get_GET.schema";
import { postLeadFormSave } from "../endpoints/leadform/save_POST.schema";
import { useOpsData } from "../helpers/useOpsData";
import { FIELD_LABELS, FIELD_ORDER, type LeadFormConfig } from "../helpers/leadFormConfig";
import { PageHeader } from "../components/PageHeader";
import { LeadFormView } from "../components/LeadFormView";
import { Input } from "../components/Input";
import { Textarea } from "../components/Textarea";
import { Switch } from "../components/Switch";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import styles from "./settings.form.module.css";

const KEY = ["leadform"];
const PRESETS = ["#0C6FD0", "#16A34A", "#0F766E", "#EA580C", "#DC2626", "#7C3AED", "#111827", "#CA8A04"];
type EmbedTab = "script" | "iframe" | "link";

export default function WebsiteFormPage() {
  const qc = useQueryClient();
  const { data: ops } = useOpsData();
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: () => getLeadForm() });
  const [cfg, setCfg] = useState<LeadFormConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<EmbedTab>("script");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data && !cfg) setCfg(data.config);
  }, [data, cfg]);

  const services = useMemo(() => (ops?.services ?? []).filter((s) => s.active), [ops]);
  const dirty = !!(data && cfg && JSON.stringify(cfg) !== JSON.stringify(data.config));

  const save = async (patch: { enabled?: boolean; notifyEmail?: boolean } = {}, withConfig = true) => {
    setSaving(true);
    try {
      await postLeadFormSave({ action: "save", ...(withConfig && cfg ? { config: cfg as unknown as Record<string, unknown> } : {}), ...patch });
      await qc.invalidateQueries({ queryKey: KEY });
      if (withConfig) setCfg(null);
      toast.success("Form saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file || !cfg) return;
    setUploading(true);
    try {
      const type = file.type || "image/png";
      const r = await postLeadFormSave({ action: "logo", contentType: type, sizeBytes: file.size });
      const put = await fetch(r.presignedUrl!, { method: "PUT", body: file, headers: { "Content-Type": type } });
      if (!put.ok) throw new Error("Upload failed");
      setCfg({ ...cfg, logoUrl: r.url! });
      toast.success("Logo added — remember to save");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't upload the logo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy — select the text and copy it instead");
    }
  };

  if (isLoading || !data || !cfg)
    return (
      <div>
        <PageHeader back="/settings" title="Website form" subtitle=" " />
        <Skeleton className={styles.skel} />
      </div>
    );

  const link = `${data.appUrl}/f/${data.key}`;
  const snippets: Record<EmbedTab, string> = {
    script: `<script src="${data.apiUrl}/embed" data-hso-form="${data.key}" async></script>`,
    iframe: `<iframe src="${link}" title="Request a quote" style="width:100%;max-width:680px;height:1000px;border:0"></iframe>`,
    link,
  };
  const up = (patch: Partial<LeadFormConfig>) => setCfg({ ...cfg, ...patch });
  const setField = (k: keyof LeadFormConfig["fields"], patch: Partial<LeadFormConfig["fields"]["name"]>) =>
    setCfg({ ...cfg, fields: { ...cfg.fields, [k]: { ...cfg.fields[k], ...patch, ...(patch.show === false ? { required: false } : {}) } } });
  const allServices = cfg.serviceIds === null;
  const toggleService = (id: number) => {
    const cur = cfg.serviceIds ?? services.map((s) => s.id);
    up({ serviceIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  const previewForm = {
    key: data.key,
    businessName: ops?.settings.business.name || "Your business",
    config: cfg,
    services: services.filter((s) => allServices || cfg.serviceIds!.includes(s.id)).map((s) => ({ id: s.id, name: s.name })),
  };

  return (
    <div>
      <Helmet>
        <title>Website form · Settings</title>
      </Helmet>
      <PageHeader
        back="/settings"
        title="Website form"
        subtitle={`${data.submissions} enquir${data.submissions === 1 ? "y" : "ies"} received${data.lastSubmissionAt ? ` · last ${new Date(data.lastSubmissionAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : ""}`}
        right={
          <Button onClick={() => save()} disabled={!dirty || saving}>
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        }
      />

      <div className={styles.layout}>
        <div className={styles.col}>
          <section className={styles.card}>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <b>Form is live</b>
                <small>{data.enabled ? "Customers can submit enquiries." : "Switched off — the form shows 'not available'."}</small>
              </div>
              <Switch checked={data.enabled} disabled={saving} onCheckedChange={(v) => save({ enabled: v }, false)} aria-label="Form is live" />
            </div>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <b>Email me new enquiries</b>
                <small>Sent to your business email.</small>
              </div>
              <Switch checked={data.notifyEmail} disabled={saving} onCheckedChange={(v) => save({ notifyEmail: v }, false)} aria-label="Email me new enquiries" />
            </div>
          </section>

          <section className={styles.card}>
            <h2>Look</h2>
            <div className={styles.lbl}>Brand colour</div>
            <div className={styles.colors}>
              {PRESETS.map((c) => (
                <button key={c} type="button" className={`${styles.swatch} ${cfg.color.toLowerCase() === c.toLowerCase() ? styles.swatchOn : ""}`} style={{ background: c }} onClick={() => up({ color: c })} aria-label={c} />
              ))}
              <label className={styles.picker}>
                <input type="color" value={cfg.color} onChange={(e) => up({ color: e.target.value.toUpperCase() })} />
                <Input value={cfg.color} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && up({ color: e.target.value.toUpperCase() })} className={styles.hex} maxLength={7} />
              </label>
            </div>

            <div className={styles.lbl}>Logo</div>
            <div className={styles.logoRow}>
              {cfg.logoUrl ? <img src={cfg.logoUrl} alt="Logo" className={styles.logo} /> : <div className={styles.logoEmpty}>No logo</div>}
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <ImagePlus size={14} /> {uploading ? "Uploading…" : cfg.logoUrl ? "Replace" : "Upload"}
              </Button>
              {cfg.logoUrl && (
                <Button variant="ghost" size="sm" onClick={() => up({ logoUrl: null })}>
                  <Trash2 size={14} /> Remove
                </Button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden onChange={(e) => uploadLogo(e.target.files?.[0])} />
            </div>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <b>Show business name</b>
              </div>
              <Switch checked={cfg.showBusinessName} onCheckedChange={(v) => up({ showBusinessName: v })} aria-label="Show business name" />
            </div>

            <div className={styles.grid2}>
              <label className={styles.field}>
                <span>Heading</span>
                <Input value={cfg.title} maxLength={80} onChange={(e) => up({ title: e.target.value })} />
              </label>
              <label className={styles.field}>
                <span>Button text</span>
                <Input value={cfg.buttonText} maxLength={40} onChange={(e) => up({ buttonText: e.target.value })} />
              </label>
              <label className={`${styles.field} ${styles.full}`}>
                <span>Intro text</span>
                <Textarea rows={2} value={cfg.subtitle} maxLength={240} onChange={(e) => up({ subtitle: e.target.value })} />
              </label>
              <label className={`${styles.field} ${styles.full}`}>
                <span>Thank-you message</span>
                <Textarea rows={2} value={cfg.successMessage} maxLength={300} onChange={(e) => up({ successMessage: e.target.value })} />
              </label>
            </div>
          </section>

          <section className={styles.card}>
            <h2>Questions</h2>
            <div className={styles.fieldsHead}>
              <span />
              <span>Show</span>
              <span>Required</span>
            </div>
            {FIELD_ORDER.map((k) => {
              const locked = k === "name";
              return (
                <div key={k} className={styles.fieldRow}>
                  <div className={styles.rowText}>
                    <b>
                      {FIELD_LABELS[k].label} {locked && <Lock size={11} className={styles.lock} />}
                    </b>
                    <small>{FIELD_LABELS[k].hint}</small>
                  </div>
                  <Switch checked={cfg.fields[k].show} disabled={locked} onCheckedChange={(v) => setField(k, { show: v })} aria-label={`Show ${FIELD_LABELS[k].label}`} />
                  <Switch
                    checked={cfg.fields[k].required}
                    disabled={locked || !cfg.fields[k].show}
                    onCheckedChange={(v) => setField(k, { required: v })}
                    aria-label={`${FIELD_LABELS[k].label} required`}
                  />
                </div>
              );
            })}
          </section>

          {cfg.fields.service.show && (
            <section className={styles.card}>
              <h2>Services to list</h2>
              {services.length === 0 ? (
                <p className={styles.muted}>Add services in Settings → Services & add-ons first.</p>
              ) : (
                <>
                  <div className={styles.chips}>
                    <button type="button" className={allServices ? styles.chipOn : styles.chip} onClick={() => up({ serviceIds: allServices ? services.map((s) => s.id) : null })}>
                      All services
                    </button>
                    {services.map((s) => {
                      const on = allServices || cfg.serviceIds!.includes(s.id);
                      return (
                        <button key={s.id} type="button" className={on ? styles.chipOn : styles.chip} onClick={() => toggleService(s.id)} disabled={allServices}>
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <b>Let customers pick more than one</b>
                    </div>
                    <Switch checked={cfg.multiService} onCheckedChange={(v) => up({ multiService: v })} aria-label="Multiple services" />
                  </div>
                </>
              )}
            </section>
          )}

          <section className={styles.card}>
            <h2>Add it to your website</h2>
            <div className={styles.tabs}>
              {(
                [
                  ["script", "Embed code"],
                  ["iframe", "iFrame"],
                  ["link", "Direct link"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" className={tab === k ? styles.tabOn : styles.tab} onClick={() => setTab(k)}>
                  {l}
                </button>
              ))}
            </div>
            <pre className={styles.code}>{snippets[tab]}</pre>
            <p className={styles.muted}>
              {tab === "script"
                ? "Paste this where the form should appear (WordPress: Custom HTML block · Wix: Embed code · Squarespace: Code block · GoHighLevel: Custom code). It resizes itself."
                : tab === "iframe"
                  ? "Use this if your site builder doesn't allow scripts. Adjust the height if needed."
                  : "Share this link on Facebook, Instagram, Google Business Profile or in emails."}
            </p>
            <div className={styles.codeActions}>
              <Button size="sm" onClick={() => copy(snippets[tab], tab === "link" ? "Link" : "Code")}>
                <Copy size={14} /> Copy
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={link} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> Open form
                </a>
              </Button>
            </div>
            {dirty && <p className={styles.warn}>Save your changes so they show on your website.</p>}
          </section>
        </div>

        <div className={styles.previewCol}>
          <div className={styles.previewLbl}>Live preview</div>
          <div className={styles.preview}>
            <LeadFormView form={previewForm} preview />
          </div>
        </div>
      </div>
    </div>
  );
}

