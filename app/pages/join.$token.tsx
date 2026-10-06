import { useParams, Link, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useQuery } from "@tanstack/react-query";
import { getInviteInfo } from "../endpoints/invites/info_GET.schema";
import { useAuth } from "../helpers/useAuth";
import { roleLabel } from "../helpers/useMe";
import { AuthScreen } from "../components/AuthScreen";
import { SignUpForm } from "../components/SignUpForm";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { Skeleton } from "../components/Skeleton";
import { Button } from "../components/Button";
import { readOAuthError } from "../helpers/oauthError";
import styles from "./join.$token.module.css";

export default function JoinPage() {
  const { token = "" } = useParams();
  const { authState } = useAuth();
  const googleError = readOAuthError();
  const { data, isLoading, error } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => getInviteInfo({ token }),
    enabled: token.length >= 10,
    retry: false,
  });

  if (authState.type === "authenticated") return <Navigate to="/" replace />;

  if (isLoading) {
    return (
      <AuthScreen title="Checking your invite…">
        <Skeleton className={styles.skel} />
      </AuthScreen>
    );
  }
  if (error || !data || !data.ok) {
    return (
      <AuthScreen title="Invite not available" subtitle={data && !data.ok ? data.reason : "This invite link isn't valid."}>
        <Button asChild variant="outline"><Link to="/login">Go to sign in</Link></Button>
      </AuthScreen>
    );
  }

  return (
    <>
      <Helmet><title>Join {data.businessName} · Local Service Pro</title></Helmet>
      <AuthScreen
        title={`Join ${data.businessName}`}
        subtitle={
          <>
            You've been invited as <b>{data.crewName ? `${data.crewName} (${roleLabel(data.role)})` : roleLabel(data.role)}</b>. Create your login to get started.
          </>
        }
      >
        {googleError && <p className={styles.error}>{googleError}</p>}
        <GoogleSignInButton mode="signup" invite={token} label="Join with Google" />
        <SignUpForm inviteToken={token} defaultEmail={data.email} />
        <p className={styles.note}>Already have a login? <Link to="/login">Sign in</Link></p>
      </AuthScreen>
    </>
  );
}
