import { emptyBackendPlan } from "../lib/contract-adapters";
import { buildEmptyBootstrapData } from "../lib/data";
import { ShelfCashApp } from "./ShelfCashApp";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ decision_view?: string; ingredient?: string }>;
}) {
  const query = await searchParams;
  const storeId = process.env.SHELFCASH_STORE_ID?.trim() || "STORE_001";
  const data = buildEmptyBootstrapData(storeId);
  const plan = emptyBackendPlan(data, "Cân bằng");
  return <ShelfCashApp
    initialData={data}
    initialDecisionIngredient={query.ingredient ?? ""}
    initialDecisionView={query.decision_view === "future" ? "future" : "today"}
    initialPlan={plan}
  />;
}
