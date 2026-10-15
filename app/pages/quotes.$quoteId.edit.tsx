import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useOpsData } from "../helpers/useOpsData";
import { PageHeader } from "../components/PageHeader";
import { QuoteBuilder } from "../components/QuoteBuilder";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { Button } from "../components/Button";
import styles from "./quotes.$quoteId.edit.module.css";

export default function EditQuotePage() {
  const { quoteId } = useParams();
  const { data } = useOpsData();
  const quote = data?.quotes.find((q) => q.id === Number(quoteId));
  return (
    <div>
      <Helmet>
        <title>Adjust quote · Local Service Pro</title>
      </Helmet>
      <PageHeader back title={quote ? `Adjust ${quote.num}` : "Adjust quote"} subtitle="Resending puts it back to awaiting" />
      {!data ? (
        <div className={styles.pad}><Skeleton className={styles.skel} /></div>
      ) : !quote || quote.status === "Converted" ? (
        <div className={styles.pad}>
          <EmptyState
            title={quote ? "Already booked" : "Quote not found"}
            body={quote ? `This quote became ${quote.jobNum}. Edit the job instead.` : undefined}
            action={<Button asChild size="sm"><Link to="/quotes">Back to quotes</Link></Button>}
          />
        </div>
      ) : (
        <QuoteBuilder data={data} quote={quote} />
      )}
    </div>
  );
}
