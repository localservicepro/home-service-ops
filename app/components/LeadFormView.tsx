import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Camera, CheckCircle2, Loader2, X } from "lucide-react";
import { MAX_PHOTOS, onColor, type PublicLeadForm } from "../helpers/leadFormConfig";
import { postLeadUpload } from "../endpoints/public/lead_upload_POST.schema";
import { postLeadSubmit } from "../endpoints/public/lead_submit_POST.schema";
import styles from "./LeadFormView.module.css";

type Photo = { id: string; preview: string; url?: string; error?: string };

/** The customer-facing enquiry form. `preview` renders it without submitting (used in Settings). */
export function LeadFormView({ form, preview = false }: { form: PublicLeadForm; preview?: boolean }) {
  const { config: c } = form;
  const f = c.fields;
  const [vals, setVals] = useState({ name: "", email: "", phone: "", address: "", notes: "", website: "" });
  const [picked, setPicked] = useState<number[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const started = useRef(Date.now());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof vals) => (e: { target: { value: string } }) => setVals((v) => ({ ...v, [k]: e.target.value }));
  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : c.multiService ? [...p, id] : [id]));

  const addFiles = async (files: FileList | null) => {
    if (!files || preview) return;
    const list = Array.from(files).slice(0, MAX_PHOTOS - photos.length);
    for (const file of list) {
      const id = Math.random().toString(36).slice(2);
      const p: Photo = { id, preview: URL.createObjectURL(file) };
      setPhotos((cur) => [...cur, p]);
      try {
        const type = file.type || "image/jpeg";
        const { presignedUrl, url } = await postLeadUpload({ key: form.key, contentType: type, sizeBytes: file.size });
        const put = await fetch(presignedUrl, { method: "PUT", body: file, headers: { "Content-Type": type } });
        if (!put.ok) throw new Error("Upload failed");
        setPhotos((cur) => cur.map((x) => (x.id === id ? { ...x, url } : x)));
      } catch (e) {
        setPhotos((cur) => cur.map((x) => (x.id === id ? { ...x, error: e instanceof Error ? e.message : "Upload failed" } : x)));
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) return;
    setError(null);
    if (photos.some((p) => !p.url && !p.error)) return setError("Please wait for your photos to finish uploading.");
    if (f.service.show && f.service.required && !picked.length) return setError("Please choose a service.");
    if (f.photos.show && f.photos.required && !photos.some((p) => p.url)) return setError("Please add at least one photo.");
    setBusy(true);
    try {
      await postLeadSubmit({
        key: form.key,
        name: vals.name,
        email: vals.email || undefined,
        phone: vals.phone || undefined,
        address: vals.address || undefined,
        notes: vals.notes || undefined,
        serviceIds: picked,
        photos: photos.filter((p) => p.url).map((p) => p.url!),
        website: vals.website || undefined,
        elapsedMs: Date.now() - started.current,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const style = { "--brand": c.color, "--on-brand": onColor(c.color) } as CSSProperties;
  const req = (k: keyof typeof f) => (f[k].required ? <span className={styles.req}>*</span> : <span className={styles.opt}>optional</span>);

  if (done)
    return (
      <div className={styles.form} style={style}>
        <div className={styles.done}>
          <CheckCircle2 size={44} className={styles.doneIcon} />
          <h2>Request sent</h2>
          <p>{c.successMessage}</p>
        </div>
      </div>
    );

  return (
    <form className={styles.form} style={style} onSubmit={submit} noValidate={preview}>
      {(c.logoUrl || c.showBusinessName) && (
        <div className={styles.brand}>
          {c.logoUrl && <img src={c.logoUrl} alt={form.businessName} className={styles.logo} />}
          {c.showBusinessName && <span className={styles.bizName}>{form.businessName}</span>}
        </div>
      )}
      {c.title && <h2 className={styles.title}>{c.title}</h2>}
      {c.subtitle && <p className={styles.subtitle}>{c.subtitle}</p>}

      <div className={styles.grid}>
        <label className={`${styles.field} ${styles.full}`}>
          <span>Name {req("name")}</span>
          <input value={vals.name} onChange={set("name")} required autoComplete="name" maxLength={200} />
        </label>
        {f.email.show && (
          <label className={styles.field}>
            <span>Email {req("email")}</span>
            <input type="email" value={vals.email} onChange={set("email")} required={f.email.required} autoComplete="email" maxLength={200} />
          </label>
        )}
        {f.phone.show && (
          <label className={styles.field}>
            <span>Phone {req("phone")}</span>
            <input type="tel" value={vals.phone} onChange={set("phone")} required={f.phone.required} autoComplete="tel" maxLength={50} />
          </label>
        )}
        {f.address.show && (
          <label className={`${styles.field} ${styles.full}`}>
            <span>Property address {req("address")}</span>
            <input value={vals.address} onChange={set("address")} required={f.address.required} autoComplete="street-address" placeholder="Street, suburb" maxLength={300} />
          </label>
        )}
        {f.service.show && form.services.length > 0 && (
          <div className={`${styles.field} ${styles.full}`}>
            <span>
              Service needed {req("service")}
              {c.multiService && <small> · choose any</small>}
            </span>
            <div className={styles.chips}>
              {form.services.map((s) => (
                <button key={s.id} type="button" className={picked.includes(s.id) ? styles.chipOn : styles.chip} onClick={() => toggle(s.id)} aria-pressed={picked.includes(s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {f.notes.show && (
          <label className={`${styles.field} ${styles.full}`}>
            <span>Tell us about the job {req("notes")}</span>
            <textarea rows={4} value={vals.notes} onChange={set("notes")} required={f.notes.required} maxLength={3000} />
          </label>
        )}
        {f.photos.show && (
          <div className={`${styles.field} ${styles.full}`}>
            <span>Photos {req("photos")}</span>
            <div className={styles.photos}>
              {photos.map((p) => (
                <div key={p.id} className={styles.thumb} style={{ backgroundImage: `url("${p.preview}")` }}>
                  {!p.url && !p.error && (
                    <span className={styles.thumbState}>
                      <Loader2 size={18} className={styles.spin} />
                    </span>
                  )}
                  {p.error && <span className={`${styles.thumbState} ${styles.thumbErr}`}>!</span>}
                  <button type="button" className={styles.remove} aria-label="Remove photo" onClick={() => setPhotos((cur) => cur.filter((x) => x.id !== p.id))}>
                    <X size={12} />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button type="button" className={styles.addPhoto} onClick={() => fileRef.current?.click()}>
                  <Camera size={20} />
                  <small>Add photo</small>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          </div>
        )}
        {/* honeypot for bots */}
        <input className={styles.hp} tabIndex={-1} autoComplete="off" value={vals.website} onChange={set("website")} aria-hidden="true" name="website" />
      </div>

      {error && <p className={styles.error}>{error}</p>}
      <button type="submit" className={styles.submit} disabled={busy}>
        {busy ? "Sending…" : c.buttonText}
      </button>
      <p className={styles.powered}>Powered by Home Service Ops</p>
    </form>
  );
}

