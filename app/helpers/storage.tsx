import { env, STORAGE_URL } from "./serverEnv";

// Server-only. Supabase Storage, public bucket `hso-public`. Returns a signed upload URL the
// browser PUTs the file to, and the file's public URL.

const BUCKET = "hso-public";
const MAX_BYTES = 15 * 1024 * 1024;

type UploadResult = { ok: true; presignedUrl: string; url: string } | { ok: false; error: { message: string } };

export async function upload(opts: { visibility: "public"; filename: string; contentType: string; sizeBytes: number }): Promise<UploadResult> {
  if (opts.sizeBytes > MAX_BYTES) return { ok: false, error: { message: "That file is too big (15 MB max)." } };
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return { ok: false, error: { message: "File storage isn't configured." } };
  const path = opts.filename.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${STORAGE_URL}/object/upload/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: "{}",
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string; error?: string };
  if (!res.ok || !body.url) return { ok: false, error: { message: body.message || body.error || "Upload couldn't be started." } };
  return { ok: true, presignedUrl: `${STORAGE_URL}${body.url}`, url: `${STORAGE_URL}/object/public/${BUCKET}/${path}` };
}
