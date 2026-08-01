import * as XLSX from "xlsx";
import { detectDataType, inferMapping } from "../../../lib/logic";
import type { DataType, ParsedSheet } from "../../../lib/types";

function safeValue(
  value: unknown,
): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ message: "Chưa chọn tệp." }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return Response.json(
        { message: "Tệp lớn hơn giới hạn 12 MB." },
        { status: 413 },
      );
    }

    const bytes = await file.arrayBuffer();
    const workbook = file.name.toLowerCase().endsWith(".csv")
      ? XLSX.read(new TextDecoder("utf-8").decode(bytes), {
          type: "string",
          cellDates: true,
          dense: true,
        })
      : XLSX.read(bytes, {
          type: "array",
          cellDates: true,
          dense: true,
        });
    const sheets: ParsedSheet[] = workbook.SheetNames.map((name) => {
      const source = workbook.Sheets[name];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(source, {
        defval: null,
        raw: false,
      });
      const columns =
        rawRows.length > 0
          ? Array.from(new Set(rawRows.flatMap((row) => Object.keys(row))))
          : [];
      const detected = detectDataType(columns);
      const mapping =
        detected.type !== "other" && detected.type !== "skip"
          ? inferMapping(
              columns,
              detected.type as Exclude<DataType, "other" | "skip">,
            )
          : Object.fromEntries(columns.map((column) => [column, "ignore"]));
      const rows = rawRows.slice(0, 2_000).map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, safeValue(value)]),
        ),
      );
      return {
        name,
        rowCount: rawRows.length,
        columns,
        rows,
        detectedType: detected.type,
        confidence: detected.confidence,
        suggestedMapping: mapping,
      };
    });

    return Response.json({ filename: file.name, sheets });
  } catch {
    return Response.json(
      { message: "Không thể đọc tệp. Hãy kiểm tra định dạng Excel hoặc CSV." },
      { status: 400 },
    );
  }
}
