import { FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { postResetPassword } from "../endpoints/auth/reset_POST.schema";
import { AuthScreen } from "../components/AuthScreen";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import styles from "./forgot.module.css";

export default function ResetPasswordPage() {
  const { token = "" } = useParams();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setError("Password must be at least 8 characters.");
    if (pw !== pw2) return setError("The passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await postResetPassword({ token, password: pw });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Helmet><title>Choose a new password · Local Service Pro</title></Helmet>
      <AuthScreen title={done ? "Password updated" : "Choose a new password"}>
        {done ? (
          <Button asChild size="lg"><Link to="/login">Sign in</Link></Button>
        ) : (
          <form onSubmit={submit} className={styles.form}>
            {error && <div className={styles.err}>{error}</div>}
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (8+ characters)" autoComplete="new-password" />
            <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Type it again" autoComplete="new-password" />
            <Button type="submit" size="lg" disabled={busy || !pw || !pw2}>{busy ? "Saving…" : "Save new password"}</Button>
          </form>
        )}
      </AuthScreen>
    </>
  );
}
