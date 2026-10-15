import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useQuery } from "@tanstack/react-query";
import { getPublicLeadForm } from "../endpoints/public/lead_form_GET.schema";
import { LeadFormView } from "../components/LeadFormView";
import styles from "./f.$key.module.css";

// Public website enquiry form. Embedded on customer websites via the api function's /embed script (iframe) or linked directly.
export default function PublicLeadFormPage() {
  const { key = "" } = useParams();
  const [params] = useSearchParams();
  const embed = params.get("embed") === "1";
  const { data, error, isLoading } = useQuery({ queryKey: ["public-lead-form", key], queryFn: () => getPublicLeadForm({ key }), retry: false });

  // Tell the parent page (embed script) how tall we are, so the iframe never scrolls.
  useEffect(() => {
    if (!embed || window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "hso-form-height", key, height: document.documentElement.scrollHeight }, "*");
    send();
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [embed, key, data]);

  return (
    <div className={`${styles.page} ${embed ? styles.embed : ""}`}>
      <Helmet>
        <title>{data ? `${data.config.title} · ${data.businessName}` : "Request a quote"}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      {isLoading ? (
        <div className={styles.loading} />
      ) : error || !data ? (
        <div className={styles.missing}>
          <h1>Form not available</h1>
          <p>This enquiry form is switched off or the link is wrong. Please contact the business directly.</p>
        </div>
      ) : (
        <LeadFormView form={data} />
      )}
    </div>
  );
}
