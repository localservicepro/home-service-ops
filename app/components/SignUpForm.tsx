import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmEmailError, postRegister } from "../endpoints/auth/register_with_password_POST.schema";
import { useAuth } from "../helpers/useAuth";
import { Input } from "./Input";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import styles from "./SignUpForm.module.css";

// Create an account. Without inviteToken it also creates the user's business.
export function SignUpForm({ inviteToken, defaultEmail, className }: { inviteToken?: string; defaultEmail?: string; className?: string }) {
  const { onLogin } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true);
    try {
      const res = await postRegister({
        displayName: name.trim(),
        email: email.trim(),
        password,
        ...(inviteToken ? { inviteToken } : { businessName: businessName.trim() }),
      });
      onLogin(res.user);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ConfirmEmailError) return setSentTo(err.email);
      setError(err instanceof Error ? err.message : "Couldn't create your account.");
    } finally {
      setBusy(false);
    }
  };

  const valid = name.trim() && email.trim() && password && (inviteToken || businessName.trim());

  if (sentTo) {
    return (
      <div className={`${styles.form} ${className ?? ""}`}>
        <div className={styles.sent}>
          <b>Check your inbox</b>
          <span>We've sent a confirmation link to {sentTo}. Tap it to finish creating your account — it opens straight into setup.</span>
        </div>
      </div>
    );
  }

  return (
    <form className={`${styles.form} ${className ?? ""}`} onSubmit={submit}>
      {error && <div className={styles.error}>{error}</div>}
      <label className={styles.field}>
        <span>Your name</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="First and last name" />
      </label>
      {!inviteToken && (
        <label className={styles.field}>
          <span>Business name</span>
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} autoComplete="organization" placeholder="e.g. Green Edge Lawn Care" />
        </label>
      )}
      <label className={styles.field}>
        <span>Email</span>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@business.com.au" />
      </label>
      <label className={styles.field}>
        <span>Password</span>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
      </label>
      <Button type="submit" size="lg" disabled={!valid || busy}>
        {busy ? <><Spinner size="sm" /> Creating account…</> : inviteToken ? "Join and sign in" : "Create account"}
      </Button>
      <p className={styles.legal}>
        By continuing you agree to our <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </form>
  );
}
