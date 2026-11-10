import { Link } from "react-router-dom";
import { LegalPage } from "../components/LegalPage";
import { PLANS, TRIAL_DAYS } from "../helpers/plans";
import styles from "../components/LegalPage.module.css";

const UPDATED = "6 October 2026";
const EMAIL = "info@localservicepro.com.au";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={UPDATED}
      intro={
        <p>
          These terms are an agreement between your business and Local Service Pro (“we”, “us”) for using Home Service Ops. By creating an account or
          using the app, you agree to them on behalf of your business. Please read them alongside our <Link to="/privacy">Privacy Policy</Link>.
        </p>
      }
    >
      <section>
        <h2>
          <span>01</span>The service
        </h2>
        <p>
          Home Service Ops is online software for home service businesses to manage quotes, jobs, schedules, crew, invoices and payments. It includes
          customer quote and invoice pages, a website enquiry form, and optional connections to third-party services. We may improve, change or remove
          features over time, and we'll give reasonable notice of changes that significantly reduce what your plan includes.
        </p>
      </section>

      <section>
        <h2>
          <span>02</span>Your account
        </h2>
        <ul>
          <li>You must be at least 18 and authorised to act for the business that owns the account.</li>
          <li>
            The person who signs up is the account <b>owner</b>. Owners can invite office admins and crew, and are responsible for everyone they give
            access to.
          </li>
          <li>Keep your login details secure, and tell us straight away if you think someone has accessed your account without permission.</li>
          <li>Information you give us about your business must be accurate and kept up to date.</li>
        </ul>
      </section>

      <section>
        <h2>
          <span>03</span>Free trial, plans and billing
        </h2>
        <ul>
          <li>
            New businesses get a <b>{TRIAL_DAYS}-day free trial</b> with the features of the Team plan. No card is needed to start.
          </li>
          <li>
            After the trial, a paid plan is needed to keep making changes. Current plans are <b>Solo</b> (${PLANS.solo.price} per month) and{" "}
            <b>Team</b> (${PLANS.team.price} per month), in Australian dollars plus GST. Each plan has the job and login limits shown in the app.
          </li>
          <li>Plans are billed monthly in advance by card through Stripe, and renew automatically until cancelled. We'll send a tax invoice for each payment.</li>
          <li>You can upgrade, downgrade or cancel at any time in Plan &amp; billing. Cancelling takes effect at the end of the period you've paid for.</li>
          <li>If a trial ends without a plan, or a payment fails and isn't fixed, the account becomes read-only. You can still view your information, and ask us for a copy of it.</li>
          <li>We'll give at least 30 days' notice of any price change, which applies from your next billing period.</li>
          <li>
            Fees are non-refundable for partly used periods, except where the Australian Consumer Law or these terms say otherwise.
          </li>
        </ul>
      </section>

      <section>
        <h2>
          <span>04</span>Your data and your customers
        </h2>
        <ul>
          <li>
            <b>You own your data.</b> That includes your business, customer, job and financial information. You give us permission to store, process and
            transmit it only as needed to provide the service.
          </li>
          <li>
            You're responsible for having a lawful basis to collect and use your customers' personal information, and for telling them how you use it. That
            includes complying with the <i>Privacy Act 1988</i> where it applies to you.
          </li>
          <li>
            Emails sent through the app (quotes, invoices, job updates and review requests) are sent on your behalf. You must only send them to people you
            have a genuine business relationship with, in line with the <i>Spam Act 2003</i>. Review requests always include an unsubscribe link, which you
            must not remove or work around.
          </li>
          <li>You can ask us for a copy of your information at any time while your account is open, and for up to 90 days after it closes. After that, we handle your data as described in our Privacy Policy.</li>
        </ul>
      </section>

      <section>
        <h2>
          <span>05</span>Payments from your customers
        </h2>
        <p>
          When you connect Stripe, Square, GoCardless or Xero, customer payments are made directly to your own account with that provider, under that
          provider's terms. We aren't a party to those payments and don't hold your funds. You're responsible for your prices, GST, refunds, disputes
          and the work you carry out for your customers.
        </p>
      </section>

      <section>
        <h2>
          <span>06</span>Third-party integrations
        </h2>
        <p>
          Integrations such as Google Calendar, Google Business Profile, HighLevel (LeadConnector), Stripe, Square, GoCardless and Xero are optional. When
          you connect one, you authorise us to exchange the relevant information with that service on your behalf. Third-party services are provided by
          their owners under their own terms. We aren't responsible for their availability or for changes they make that affect the integration.
        </p>
      </section>

      <section>
        <h2>
          <span>07</span>Acceptable use
        </h2>
        <p>You agree not to:</p>
        <ul>
          <li>use the service for anything unlawful, misleading, or that infringes someone else's rights;</li>
          <li>send spam, or upload malicious code or content you don't have the right to use;</li>
          <li>try to access other businesses' data, probe or bypass our security, or overload the service;</li>
          <li>resell or provide the service to others without our written agreement, or copy or reverse-engineer it.</li>
        </ul>
        <p>We may suspend access that breaches these rules or puts the service or other users at risk. Where practical, we'll tell you first and give you a chance to fix it.</p>
      </section>

      <section>
        <h2>
          <span>08</span>Availability and support
        </h2>
        <p>
          We work to keep Home Service Ops available and reliable, but we don't guarantee it will be uninterrupted or error-free. Maintenance, outages at our
          providers, or events outside our control can affect it. Support is available by email at <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
        </p>
      </section>

      <section>
        <h2>
          <span>09</span>Our intellectual property
        </h2>
        <p>
          We own the Home Service Ops software, design and brand. These terms give you a non-exclusive, non-transferable right to use the service for your
          business while your account is active. If you send us feedback, we may use it to improve the service without owing you anything.
        </p>
      </section>

      <section>
        <h2>
          <span>10</span>Liability
        </h2>
        <p>
          Nothing in these terms excludes rights you have under the Australian Consumer Law that can't be excluded. Where the law allows us to limit our
          liability for a failure to meet a consumer guarantee, our liability is limited to supplying the service again or paying the cost of having it
          supplied again.
        </p>
        <p>
          To the extent the law allows, we aren't liable for indirect or consequential loss, such as lost profits, lost revenue or lost data. Our total
          liability arising from these terms is limited to the fees you paid us in the 12 months before the claim. You're responsible for checking quotes,
          invoices and payments before you rely on them, and for keeping your own records where the law requires.
        </p>
      </section>

      <section>
        <h2>
          <span>11</span>Ending the agreement
        </h2>
        <p>
          You can cancel your plan and close your account at any time. We may end or suspend these terms if you seriously breach them and don't fix the
          breach within 14 days of our notice, or immediately if required by law. We may also stop offering the service with at least 60 days' notice, in
          which case we'll refund any prepaid fees for the period after it ends. Sections about data, payments, liability and our intellectual property
          continue after the agreement ends.
        </p>
      </section>

      <section>
        <h2>
          <span>12</span>General
        </h2>
        <ul>
          <li>We may update these terms. We'll post the new version here and give at least 30 days' notice of material changes by email or in the app. Continuing to use the service after that means you accept them.</li>
          <li>These terms are governed by the laws in force in Australia, and both of us can bring proceedings in Australian courts.</li>
          <li>If any part of these terms can't be enforced, the rest still applies. Not enforcing a right straight away doesn't waive it.</li>
        </ul>
        <p>
          Questions about these terms: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
