import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useOpsData } from "../helpers/useOpsData";
import { PageHeader } from "../components/PageHeader";
import { QuoteBuilder } from "../components/QuoteBuilder";
import { Skeleton } from "../components/Skeleton";
import styles from "./quotes.new.module.css";

export default function NewQuotePage() {
  const { data } = useOpsData();
  const [params] = useSearchParams();
  const fromJob = data?.jobs.find((j) => j.id === Number(params.get("fromJob")));
  return (
    <div>
      <Helmet>
        <title>New quote · Local Service Pro</title>
      </Helmet>
      <PageHeader back title="New quote" subtitle={fromJob ? `For request ${fromJob.num}` : "Build and send a price"} />
      {data ? (
        <QuoteBuilder data={data} fromJob={fromJob} />
      ) : (
        <div className={styles.loading}>
          <Skeleton className={styles.skel} />
          <Skeleton className={styles.skel} />
        </div>
      )}
    </div>
  );
}
