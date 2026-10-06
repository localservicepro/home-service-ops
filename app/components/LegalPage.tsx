import { ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Zap } from "lucide-react";
import styles from "./LegalPage.module.css";

// Shared layout for the public Privacy Policy and Terms of Service pages.
export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: ReactNode; children: ReactNode }) {
  useEffect(() => window.scrollTo(0, 0), []);
  return (
    <div className={styles.page}>
      <Helmet>
        <title>{title} · Home Service Ops</title>
      </Helmet>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <Link to="/" className={styles.logo}>
            <span className={styles.mark}>
              <Zap size={16} />
            </span>
            <span>
              <b>Home Service Ops</b>
              <small>BY LOCAL SERVICE PRO</small>
            </span>
          </Link>
          <nav>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/login" className={styles.login}>
              Log in
            </Link>
          </nav>
        </div>
      </header>
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.eyebrow}>Legal</span>
          <h1>{title}</h1>
          <p className={styles.updated}>Last updated {updated}</p>
          <div className={styles.intro}>{intro}</div>
        </div>
      </div>
      <main className={styles.body}>
        <article className={styles.article}>{children}</article>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <a href="mailto:info@localservicepro.com.au">Contact</a>
          </nav>
          <small>© {new Date().getFullYear()} Local Service Pro. Made in Australia for home service businesses.</small>
        </div>
      </footer>
    </div>
  );
}
