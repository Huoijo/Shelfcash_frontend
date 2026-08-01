import { emptyBackendPlan } from "../lib/contract-adapters";
import { buildEmptyBootstrapData } from "../lib/data";
import { ShelfCashApp } from "./ShelfCashApp";

export default function Home() {
  const data = buildEmptyBootstrapData();
  const plan = emptyBackendPlan(data, "Cân bằng");
  return <ShelfCashApp initialData={data} initialPlan={plan} />;
}
