import { Link } from "react-router-dom";
import { LegalPage } from "../components/LegalPage";
import styles from "../components/LegalPage.module.css";

const UPDATED = "6 October 2026";
const EMAIL = "info@localservicepro.com.au";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={UPDATED}
      intro={
        <>
          <p>
            Home Service Ops is a job management app made by Local Service Pro (“we”, “us”). This policy explains what personal information we handle,
            why, where it's stored and the choices you have. We follow the Australian Privacy Principles in the <i>Privacy Act 1988</i> (Cth).
          </p>
        </>
      }
    >
      <section>
        <h2>
          <span>01</span>Who this covers
        </h2>
        <p>This policy applies to:</p>
        <ul>
          <li>
            <b>Account holders</b>: business owners, office admins and crew who sign in to Home Service Ops.
          </li>
          <li>
            <b>Customers of those businesses</b>: people whose details a business enters, or who view a quote or invoice, or send an enquiry through a
            business's website form.
          </li>
          <li>
            <b>Visitors</b> to our website at home.localservicepro.com.au.
          </li>
        </ul>
        <p className={styles.note}>
          When a business uses Home Service Ops to manage its own customers, that business decides what information it collects and how it uses it. We
          store and process that information on the business's behalf. If you're a customer of a business using our app, please contact that business
          first about your information. We'll help them respond.
        </p>
      </section>

      <section>
        <h2>
          <span>02</span>What we collect
        </h2>
        <h3>From account holders</h3>
        <ul>
          <li>Name, email address and password (stored only as a secure hash by our authentication provider), or your Google profile if you sign in with Google.</li>
          <li>Business details you enter: business name, ABN, phone, address, service area, logo, bank details for invoices, price list and settings.</li>
          <li>Crew details: names, mobile numbers, pay rates, duty status, on-site time and job photos taken in the app.</li>
          <li>Subscription and billing records. Card details are collected and held by Stripe; we never see your full card number.</li>
        </ul>
        <h3>About a business's customers</h3>
        <ul>
          <li>Name, phone, email and property addresses.</li>
          <li>Quotes, jobs, invoices, payment status, notes and before/after photos of the work.</li>
          <li>Enquiries submitted through a business's website form, including any photos attached.</li>
          <li>Whether a quote or invoice link has been opened, and a quote's accept or decline response.</li>
        </ul>
        <h3>Automatically</h3>
        <ul>
          <li>
            Basic technical data our hosting providers log to keep the service secure and working, such as IP address, browser type and request times.
          </li>
          <li>
            To limit spam on website enquiry forms we store a one-way hash of the sender's IP address, not the address itself, for a short period.
          </li>
        </ul>
        <p>
          We don't use advertising trackers or sell personal information. The app stores your sign-in session and a few display preferences in your
          browser's local storage so you stay signed in.
        </p>
      </section>

      <section>
        <h2>
          <span>03</span>How we use it
        </h2>
        <ul>
          <li>To provide the app: running jobs, quotes, invoices, schedules, crew logins and payments.</li>
          <li>
            To send emails a business asks us to send on its behalf, such as quotes, invoices, invites, job updates and review requests. These come from the
            business's name, and replies go to the business.
          </li>
          <li>To send account emails such as sign-up confirmation, password resets and billing notices.</li>
          <li>To connect the integrations a business switches on (see section 4).</li>
          <li>To provide support, prevent fraud and abuse, keep the service secure, and meet our legal obligations.</li>
          <li>To improve the product, using aggregated information that doesn't identify individuals.</li>
        </ul>
        <p>
          Review request emails always include an unsubscribe link, and a business can mark a customer as “don't ask for reviews” at any time.
        </p>
      </section>

      <section>
        <h2>
          <span>04</span>Who we share it with
        </h2>
        <p>
          We share personal information only with the service providers that run Home Service Ops, and with the integrations a business chooses to
          connect. Each provider may only use it to provide its service to us.
        </p>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>What for</th>
                <th>Where</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Supabase</td>
                <td>Database, sign-in, file storage and app servers</td>
                <td>Sydney, Australia</td>
              </tr>
              <tr>
                <td>Vercel</td>
                <td>Delivers the web app to your browser</td>
                <td>Global network (incl. USA)</td>
              </tr>
              <tr>
                <td>Resend</td>
                <td>Sends app emails</td>
                <td>Japan / USA</td>
              </tr>
              <tr>
                <td>Stripe</td>
                <td>Subscription billing, and card payments for businesses that connect Stripe</td>
                <td>USA / global</td>
              </tr>
              <tr>
                <td>Google</td>
                <td>Google sign-in, Google Calendar sync and Google Business Profile reviews (only if switched on)</td>
                <td>USA / global</td>
              </tr>
              <tr>
                <td>Square, GoCardless, Xero, HighLevel (LeadConnector)</td>
                <td>Payments, direct debit, accounting and CRM sync (only if a business connects them)</td>
                <td>Various, incl. USA, UK and New Zealand</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          When a business connects an integration, the relevant job, customer and payment details are sent to that provider under the business's own
          account with them, and that provider's privacy policy also applies.
        </p>
        <p>
          Some of these providers store or process information outside Australia. We choose providers with strong security and privacy commitments and
          take reasonable steps so they handle personal information consistently with the Australian Privacy Principles.
        </p>
        <p>We may also disclose information if the law requires it, or to protect the rights, safety or property of anyone.</p>
      </section>

      <section>
        <h2>
          <span>05</span>How we keep it safe
        </h2>
        <ul>
          <li>Your business data is stored in Sydney and kept separate from every other business. Each request is checked against your login and role.</li>
          <li>Crew only see the jobs assigned to them, never other staff's pay, your payments, client list or settings.</li>
          <li>Information is encrypted in transit (HTTPS) and at rest by our hosting provider.</li>
          <li>Passwords are never stored in readable form, and links in quote and invoice emails use long random codes.</li>
        </ul>
        <p>
          No system is perfectly secure. If a data breach is likely to cause serious harm, we will notify affected businesses and individuals and the
          Office of the Australian Information Commissioner as required by the Notifiable Data Breaches scheme.
        </p>
      </section>

      <section>
        <h2>
          <span>06</span>How long we keep it
        </h2>
        <p>
          We keep a business's information while its account is open. If a business closes its account, we delete or de-identify its data within 90
          days, unless the law requires us to keep it longer (for example, billing records for tax purposes). A business can ask us to delete its data
          sooner.
        </p>
      </section>

      <section>
        <h2>
          <span>07</span>Your choices and rights
        </h2>
        <ul>
          <li>
            <b>Access and correction:</b> account holders can view and update most information directly in the app. You can also ask us for a copy of the
            personal information we hold about you, or to correct it.
          </li>
          <li>
            <b>Customers of a business:</b> please contact the business first. We'll support them in responding to your request.
          </li>
          <li>
            <b>Marketing:</b> we only send product news to account holders, and every such email has an unsubscribe link.
          </li>
        </ul>
        <p>We'll respond to requests within 30 days. We may need to confirm your identity first.</p>
      </section>

      <section>
        <h2>
          <span>08</span>Contact and complaints
        </h2>
        <p>
          Questions or complaints about privacy: email <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. We'll acknowledge your complaint within 7 days and try to
          resolve it within 30 days.
        </p>
        <p>
          If you're not satisfied with our response, you can contact the Office of the Australian Information Commissioner at{" "}
          <a href="https://www.oaic.gov.au" target="_blank" rel="noreferrer">
            oaic.gov.au
          </a>{" "}
          or 1300 363 992.
        </p>
      </section>

      <section>
        <h2>
          <span>09</span>Changes to this policy
        </h2>
        <p>
          We may update this policy as the app changes. We'll post the new version here with a new “last updated” date, and tell account holders by
          email or in the app about significant changes. See also our <Link to="/terms">Terms of Service</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
