import type {
  InventoryConstraint,
  ProcurementSettingsRow,
  QuantitySetting,
  SupplierConstraintRow,
} from "./types";

function quantity(constraint: InventoryConstraint | undefined): QuantitySetting | null {
  if (!constraint) return null;
  const value =
    typeof constraint.value === "number"
      ? constraint.value
      : Number(constraint.value);
  if (!Number.isFinite(value)) return null;
  return {
    value,
    unit: constraint.unit,
    constraintId: constraint.constraintId,
    effectiveDate: constraint.effectiveDate,
    version: constraint.version,
  };
}

export function buildProcurementSettingsRows(
  supplierConstraints: SupplierConstraintRow[],
  inventoryConstraints: InventoryConstraint[],
  asOfDate?: string,
): ProcurementSettingsRow[] {
  void asOfDate; // The endpoint resolves effective versions for this date.
  const rows = new Map<string, ProcurementSettingsRow>();
  const ambiguous = new Set<string>();
  const ensure = (ingredientId: string, ingredientName: string) => {
    let row = rows.get(ingredientId);
    if (!row) {
      row = {
        ingredientId,
        ingredientName,
        safetyStock: null,
        maximumStock: null,
        supplierTerms: [],
      };
      rows.set(ingredientId, row);
    }
    return row;
  };

  for (const term of supplierConstraints) {
    if (!term.ingredientId) continue;
    ensure(term.ingredientId, term.ingredient).supplierTerms.push(term);
  }
  for (const constraint of inventoryConstraints) {
    if (!constraint.ingredientId) continue;
    const row = ensure(
      constraint.ingredientId,
      constraint.ingredientName ?? constraint.ingredientId,
    );
    if (constraint.constraintType === "safety_stock") {
      const key = `${constraint.ingredientId}:safety_stock`;
      if (row.safetyStock || ambiguous.has(key)) {
        ambiguous.add(key);
        row.safetyStock = null;
      } else row.safetyStock = quantity(constraint);
    } else if (constraint.constraintType === "maximum_stock") {
      const key = `${constraint.ingredientId}:maximum_stock`;
      if (row.maximumStock || ambiguous.has(key)) {
        ambiguous.add(key);
        row.maximumStock = null;
      } else row.maximumStock = quantity(constraint);
    }
  }
  return [...rows.values()];
}
