import { Link } from "react-router-dom";
import { LegalPage } from "../components/LegalPage";
import styles from "../components/LegalPage.module.css";

const EMAIL = "info@localservicepro.com.au";

// Public page for Google Play's "account deletion" link: how to delete a Home Service Ops account.
export default function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete your account"
      updated="15 October 2026"
      intro={<p>You can delete your Home Service Ops account at any time, from the Android app or the website.</p>}
    >
      <section>
        <h2>
          <span>01</span>In the app or on the website
        </h2>
        <ol>
          <li>
            Sign in to Home Service Ops (the Android app, or <Link to="/login">home.localservicepro.com.au</Link>).
          </li>
          <li>
            Open <b>Settings</b> (crew: <b>Profile</b>).
          </li>
          <li>
            Tap <b>Delete my account</b>, type <b>DELETE</b> and confirm.
          </li>
        </ol>
        <p>Your login is deleted straight away and you're signed out.</p>
      </section>

      <section>
        <h2>
          <span>02</span>What gets deleted
        </h2>
        <ul>
          <li>
            <b>Business owners:</b> your login and your business, including its clients, quotes, jobs, invoices, photos, team logins and connected
            apps. Any paid plan is cancelled immediately.
          </li>
          <li>
            <b>Office admins and crew:</b> your login and profile. Jobs and records you worked on belong to the business and stay with it.
          </li>
        </ul>
        <p>
          Billing records we must keep for tax purposes (Stripe invoices) are kept for up to 7 years. Backups are overwritten within 30 days.
        </p>
      </section>

      <section>
        <h2>
          <span>03</span>Can't sign in?
        </h2>
        <p>
          Email <a href={`mailto:${EMAIL}?subject=Delete%20my%20account`}>{EMAIL}</a> from the address you sign in with and ask us to delete your
          account. We'll confirm and delete it within 7 days. See our <Link to="/privacy">Privacy Policy</Link> for more.
        </p>
      </section>
    </LegalPage>
  );
}
