import { emptyBackendPlan } from "../lib/contract-adapters";
import { buildEmptyBootstrapData } from "../lib/data";
import { ShelfCashApp } from "./ShelfCashApp";

export default function Home() {
  const storeId = process.env.SHELFCASH_STORE_ID?.trim() ?? "";
  const data = buildEmptyBootstrapData(storeId);
  const plan = emptyBackendPlan(data, "Cân bằng");
  return <ShelfCashApp initialData={data} initialPlan={plan} />;
}
