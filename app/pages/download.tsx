import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Download, Zap, ShieldCheck, Smartphone, Apple, LogIn } from "lucide-react";
import { APK_URL, isAndroidBrowser, isIOS } from "../helpers/appDownload";
import { QrCode } from "../components/QrCode";
import styles from "./download.module.css";

// Public "Get the Android app" page: download on Android, a QR code on computers, and what to
// do on iPhone (no app yet).
export default function DownloadPage() {
  useEffect(() => window.scrollTo(0, 0), []);
  const android = isAndroidBrowser();
  const ios = isIOS();
  const pageUrl = `${window.location.origin}/download`;

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Get the Android app · Home Service Ops</title>
        <meta name="description" content="Download the Home Service Ops app for Android: quotes, jobs, schedule, invoices and client texts on your phone." />
      </Helmet>
      <header className={styles.top}>
        <Link to="/" className={styles.logo}>
          <span className={styles.mark}><Zap size={16} /></span>
          <span>
            <b>Home Service Ops</b>
            <small>BY LOCAL SERVICE PRO</small>
          </span>
        </Link>
        <Link to="/login" className={styles.login}>Log in</Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.copy}>
            <span className={styles.appIcon}><Zap size={34} fill="currentColor" strokeWidth={0} /></span>
            <h1>Home Service Ops for Android</h1>
            <p>Quotes, jobs, your schedule, invoices and client texts in your pocket. Your crew gets their day, directions and job photos in one tap.</p>
            {ios ? (
              <div className={styles.iosNote}>
                <Apple size={18} />
                <span>
                  <b>On iPhone?</b> The iPhone app is coming. For now, open <b>home.localservicepro.com.au</b> in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.
                </span>
              </div>
            ) : (
              <a href={APK_URL} className={styles.download} download>
                <Download size={20} /> Download for Android
              </a>
            )}
            <small className={styles.meta}>Free with your Home Service Ops account · Android 7 or newer</small>
          </div>
          {!android && !ios && (
            <div className={styles.qrCard}>
              <QrCode value={pageUrl} size={176} />
              <b>Scan with your Android phone</b>
              <small>Opens this page on your phone so you can install it there.</small>
            </div>
          )}
        </div>
      </section>

      <main className={styles.steps}>
        <h2>Installing takes a minute</h2>
        <ol>
          <li>
            <span className={styles.stepIcon}><Download size={18} /></span>
            <div>
              <b>Download the app</b>
              <p>Tap <b>Download for Android</b> on your phone. If Chrome asks, tap <b>Download anyway</b>.</p>
            </div>
          </li>
          <li>
            <span className={styles.stepIcon}><ShieldCheck size={18} /></span>
            <div>
              <b>Open it and tap Install</b>
              <p>
                Open the downloaded file. The first time, Android asks you to allow installs from your browser: tap <b>Settings</b>, switch on{" "}
                <b>Allow from this source</b>, then go back and tap <b>Install</b>.
              </p>
            </div>
          </li>
          <li>
            <span className={styles.stepIcon}><LogIn size={18} /></span>
            <div>
              <b>Sign in</b>
              <p>Open Home Service Ops and sign in with the same email and password (or Google) you use on the website.</p>
            </div>
          </li>
        </ol>
        <p className={styles.fine}>
          <Smartphone size={15} /> The app updates itself with every improvement we make, so you only install it once. Coming to Google Play soon.
        </p>
      </main>
    </div>
  );
}
