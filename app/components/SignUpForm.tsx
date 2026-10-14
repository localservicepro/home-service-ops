import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmEmailError, postRegister } from "../endpoints/auth/register_with_password_POST.schema";
import { postInviteJoin, type OutputType as JoinResult } from "../endpoints/invites/join_POST.schema";
import { postLogin } from "../endpoints/auth/login_with_password_POST.schema";
import { PENDING_SIGNUP_KEY } from "../endpoints/auth/session_GET.schema";
import { useAuth } from "../helpers/useAuth";
import { Input } from "./Input";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import styles from "./SignUpForm.module.css";

// Create an account. Without inviteToken it also creates the user's business. With an emailed
// invite (inviteToken + defaultEmail) the login is created already confirmed and signed in.
export function SignUpForm({
  inviteToken,
  defaultEmail,
  businessName: inviteBusiness,
  className,
}: {
  inviteToken?: string;
  defaultEmail?: string;
  businessName?: string;
  className?: string;
}) {
  const emailedInvite = !!inviteToken && !!defaultEmail;
  const { onLogin } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [existing, setExisting] = useState<Extract<JoinResult, { status: "existing" }> | null>(null);
  const [existingPassword, setExistingPassword] = useState("");

  const finish = async (loginEmail: string, loginPassword: string) => {
    const res = await postLogin({ email: loginEmail, password: loginPassword });
    onLogin(res.user);
    navigate("/", { replace: true });
  };

  // Existing login: sign in with it, and the invite is applied on the way in.
  const signInExisting = async (e: FormEvent) => {
    e.preventDefault();
    if (!existing || !inviteToken) return;
    setError(null);
    setBusy(true);
    try {
      try {
        localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({ mode: "signin", inviteToken }));
      } catch {
        /* storage blocked */
      }
      await finish(existing.email, existingPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true);
    try {
      if (emailedInvite) {
        const r = await postInviteJoin({ token: inviteToken!, displayName: name.trim(), password });
        if (r.status === "existing") return setExisting(r);
        return await finish(r.email, password);
      }
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

  if (existing) {
    if (existing.ownBusiness) {
      return (
        <div className={`${styles.form} ${className ?? ""}`}>
          <div className={styles.notice}>
            <b>This email already has a login</b>
            <span>
              {existing.email} is already signed up to another business, and a login can belong to one business at a time. Ask
              {inviteBusiness ? ` ${inviteBusiness}` : " whoever invited you"} to send the invite to a different email.
            </span>
          </div>
        </div>
      );
    }
    return (
      <form className={`${styles.form} ${className ?? ""}`} onSubmit={signInExisting}>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.notice}>
          <b>{existing.member ? "You're already in" : "You already have a login"}</b>
          <span>
            {existing.member ? `${existing.email} is already part of ${inviteBusiness ?? "this business"}.` : `${existing.email} is already signed up.`}{" "}
            {existing.password ? `Enter your password to sign in${existing.member ? "" : " and join"}` : `Sign in${existing.member ? "" : " to join"}`}
            {existing.google ? (existing.password ? ", or use Join with Google above." : " with Join with Google above.") : "."}
          </span>
        </div>
        {existing.password && (
          <>
            <label className={styles.field}>
              <span>Password</span>
              <Input type="password" value={existingPassword} onChange={(e) => setExistingPassword(e.target.value)} autoComplete="current-password" autoFocus />
            </label>
            <Button type="submit" size="lg" disabled={!existingPassword || busy}>
              {busy ? <><Spinner size="sm" /> Signing in…</> : existing.member ? "Sign in" : "Sign in and join"}
            </Button>
          </>
        )}
      </form>
    );
  }

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
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={emailedInvite}
          autoComplete="email"
          placeholder="you@business.com.au"
        />
        {emailedInvite && <small className={styles.hint}>Your invite was sent to this email.</small>}
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
