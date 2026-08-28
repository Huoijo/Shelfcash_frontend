import type {
  DecisionBriefFacts,
  DecisionCriticFinding,
  DecisionPackage,
  DecisionStrategy,
} from "./types";
import { formatVnd } from "../app/components/ui";

export type DiagnosticOrigin = "real" | "mock";

export interface StrategyEvalResult {
  status: "pass" | "warn" | "fail";
  label: string;
  observed: string;
  note: string;
}

export interface CriticCheckItem {
  code: string;
  title: string;
  description: string;
  requirement: string;
  origin: DiagnosticOrigin;
  results: {
    lean: StrategyEvalResult;
    balanced: StrategyEvalResult;
    protected: StrategyEvalResult;
  };
}

export interface StrategySummaryCardInfo {
  strategy: "lean" | "balanced" | "protected";
  label: string;
  passedCount: number;
  totalCount: number;
  statusTag: "pass" | "warn" | "fail";
  statusLabel: string;
  reason: string;
  origin: DiagnosticOrigin;
}

export interface DecisionDiagnosticsReport {
  origin: DiagnosticOrigin;
  originLabel: string;
  isMockEnabled: boolean;
  hasRealCriticData: boolean;
  checks: CriticCheckItem[];
  summaries: Record<"lean" | "balanced" | "protected", StrategySummaryCardInfo>;
  rawViolations: Record<"lean" | "balanced" | "protected", string[]>;
  rawWarnings: Record<"lean" | "balanced" | "protected", string[]>;
}

/**
 * Kiểm tra xem chế độ dữ liệu giả định (mock diagnostics) có được bật trong ENV hay không.
 * Mặc định hỗ trợ qua biến NEXT_PUBLIC_ENABLE_DECISION_MOCK_DIAGNOSTICS,
 * hoặc NEXT_PUBLIC_DECISION_MOCK_FAILURES, hoặc USE_MOCK_API.
 */
export function isDecisionMockDiagnosticsEnabled(): boolean {
  if (typeof process !== "undefined" && process.env) {
    const val =
      process.env.NEXT_PUBLIC_ENABLE_DECISION_MOCK_DIAGNOSTICS ||
      process.env.NEXT_PUBLIC_DECISION_MOCK_FAILURES ||
      process.env.ENABLE_DECISION_MOCK_DIAGNOSTICS;
    if (val !== undefined && val !== "") {
      return val.toLowerCase() === "true" || val === "1";
    }

    // Nếu USE_MOCK_API đang bật toàn hệ thống thì mặc định cho phép mock diagnostics
    const useMockApi =
      process.env.NEXT_PUBLIC_USE_MOCK_API ||
      process.env.USE_MOCK_API ||
      process.env.SHELFCASH_USE_MOCK_API;
    if (useMockApi && (useMockApi.toLowerCase() === "true" || useMockApi === "1")) {
      return true;
    }
  }
  return false;
}

function friendlyCheckTitle(code: string): { title: string; description: string; req: string } {
  const normalized = code.toUpperCase();
  if (normalized.includes("BUDGET") || normalized.includes("HARD_BUDGET")) {
    return {
      title: "Hạn mức ngân sách tối đa (Budget Cap)",
      description: "Chi phí mua hàng của kịch bản không được vượt quá ngân sách khả dụng của cửa hàng.",
      req: "Chi phí mua ≤ Ngân sách khả dụng",
    };
  }
  if (normalized.includes("SERVICE_LEVEL") || normalized.includes("FILL_RATE")) {
    return {
      title: "Mức phục vụ mục tiêu (Target Service Level)",
      description: "Tỉ lệ đáp ứng nhu cầu khách hàng phải đạt chuẩn an toàn cung ứng và khống chế xác suất đứt hàng.",
      req: "Fill Rate ≥ 95.0% · Stockout Prob ≤ 5.0%",
    };
  }
  if (normalized.includes("SAFETY_FLOOR") || normalized.includes("EXACT_SIMULATION")) {
    return {
      title: "Sàn an toàn mô phỏng (Exact Simulation Safety Floor)",
      description: "Mức độ an toàn hàng tồn kho theo kịch bản mô phỏng chi tiết.",
      req: "Đáp ứng ngưỡng an toàn tối thiểu",
    };
  }
  if (normalized.includes("EXPIRY") || normalized.includes("FEFO") || normalized.includes("WASTE")) {
    return {
      title: "Kiểm soát hạn sử dụng & Hao hụt (FEFO)",
      description: "Hạn chế tích trữ quá chu kỳ sử dụng của nguyên liệu tươi sống gây hủy hàng quá date.",
      req: "Hao hụt ≤ Chu kỳ date khả dụng",
    };
  }
  if (normalized.includes("LEAD_TIME") || normalized.includes("BUFFER")) {
    return {
      title: "Thời gian giao hàng khả thi (Lead Time Buffer)",
      description: "Ngày hàng về phải trước hoặc đúng ngày dự kiến cạn kiệt tồn kho an toàn.",
      req: "Lead time buffer ≥ 1 ngày đệm an toàn",
    };
  }
  if (normalized.includes("MOQ") || normalized.includes("SUPPLIER_MOQ")) {
    return {
      title: "Số lượng đặt tối thiểu (Supplier MOQ)",
      description: "Mọi dòng đặt hàng phải đáp ứng số lượng tối thiểu từ nhà cung cấp.",
      req: "Order Qty ≥ MOQ quy định",
    };
  }
  if (normalized.includes("PACK_SIZE") || normalized.includes("ROUNDING")) {
    return {
      title: "Quy cách đóng gói (Pack Size Rounding)",
      description: "Số lượng đặt phải được làm tròn theo lốc/thùng nguyên vẹn của từng mặt hàng.",
      req: "Làm tròn chẵn nguyên thùng/gói",
    };
  }
  return {
    title: code.replace(/[._:-]/g, " "),
    description: `Thẩm định ràng buộc hệ thống cho chỉ tiêu ${code}.`,
    req: "Tuân thủ quy chuẩn vận hành",
  };
}

/**
 * Trích xuất dữ liệu thẩm định và nguyên nhân thất bại THỰC TẾ từ Solver / Backend Decision Package.
 */
export function extractRealCriticDiagnostics(
  brief: DecisionBriefFacts,
  decision?: DecisionPackage | null,
  remainingBudget = 15000000,
): DecisionDiagnosticsReport | null {
  const rawStrategies = Array.isArray(decision?.strategies)
    ? decision.strategies
    : decision?.strategies && typeof decision.strategies === "object"
      ? Object.entries(decision.strategies).map(([k, v]) => ({
          strategy: k as any,
          ...(v as any),
        }))
      : [];

  const globalFindings: DecisionCriticFinding[] = decision?.critic?.findings ?? [];
  const hardViolations = brief.critic?.hard_violations ?? [];
  const globalWarnings = [
    ...(brief.critic?.warnings ?? []),
    ...(decision?.warnings ?? []),
  ];

  const strategyMap: Record<"lean" | "balanced" | "protected", DecisionStrategy | undefined> = {
    lean: rawStrategies.find((s) => s.strategy === "lean"),
    balanced: rawStrategies.find((s) => s.strategy === "balanced"),
    protected: rawStrategies.find((s) => s.strategy === "protected"),
  };

  const rawViolations: Record<"lean" | "balanced" | "protected", string[]> = {
    lean: strategyMap.lean?.violations ?? [],
    balanced: strategyMap.balanced?.violations ?? [],
    protected: strategyMap.protected?.violations ?? [],
  };

  const rawWarnings: Record<"lean" | "balanced" | "protected", string[]> = {
    lean: strategyMap.lean?.warnings ?? [],
    balanced: strategyMap.balanced?.warnings ?? [],
    protected: strategyMap.protected?.warnings ?? [],
  };

  // Xác định xem backend có trả về dữ liệu critic hoặc violations/strategies thực tế không
  const hasStrategyData = rawStrategies.length > 0;
  const hasCriticFindings = globalFindings.length > 0;
  const hasAnyViolations =
    hardViolations.length > 0 ||
    rawViolations.lean.length > 0 ||
    rawViolations.balanced.length > 0 ||
    rawViolations.protected.length > 0;

  const hasRealData = hasStrategyData || hasCriticFindings || hasAnyViolations;

  if (!hasRealData && !decision?.failure_code && !decision?.failure_message) {
    return null;
  }

  // Thu thập tất cả các codes / checks thực tế từ findings và violations
  const checkCodes = new Set<string>();

  // 1. HARD_BUDGET_CAP luôn kiểm tra trên chi phí thực tế nếu có
  checkCodes.add("HARD_BUDGET_CAP");
  // 2. SERVICE_LEVEL_FLOOR
  checkCodes.add("SERVICE_LEVEL_FLOOR");

  globalFindings.forEach((f) => {
    if (f.code) checkCodes.add(f.code);
  });

  (["lean", "balanced", "protected"] as const).forEach((stKey) => {
    const st = strategyMap[stKey];
    const findings = (st as any)?.critic?.findings as DecisionCriticFinding[] | undefined;
    findings?.forEach((f) => {
      if (f.code) checkCodes.add(f.code);
    });
  });

  const checks: CriticCheckItem[] = Array.from(checkCodes).map((code) => {
    const info = friendlyCheckTitle(code);

    const evaluateStrat = (stratKey: "lean" | "balanced" | "protected"): StrategyEvalResult => {
      const st = strategyMap[stratKey];
      const isChosen = brief.recommendation.strategy === stratKey && brief.recommendation.available;
      const cost = st?.business_metrics?.projected_purchase_cost;
      const fillRate = st?.business_metrics?.expected_fill_rate;
      const stockout = st?.business_metrics?.stockout_probability;

      if (code === "HARD_BUDGET_CAP") {
        if (cost != null) {
          const isOver = cost > remainingBudget;
          const ratio = remainingBudget > 0 ? Math.round((cost / remainingBudget) * 100) : 0;
          return {
            status: isOver ? "fail" : isChosen ? "pass" : "pass",
            label: isOver ? "VƯỢT NGÂN SÁCH" : isChosen ? "ĐẠT TỐI ƯU" : "ĐẠT (PASS)",
            observed: `${formatVnd(cost)} (${ratio}% ngân sách)`,
            note: isOver
              ? `Chi phí vượt hạn mức ngân sách ${formatVnd(remainingBudget)}.`
              : `Nằm trong hạn mức chi tiêu cho phép.`,
          };
        }
        return {
          status: "pass",
          label: "ĐẠT",
          observed: "Chi phí hợp lệ",
          note: "Theo tính toán từ Solver.",
        };
      }

      if (code === "SERVICE_LEVEL_FLOOR") {
        if (fillRate != null || stockout != null) {
          const frText = fillRate != null ? `Fill Rate: ${(fillRate * 100).toFixed(1)}%` : "";
          const soText = stockout != null ? `Xác suất thiếu: ${(stockout * 100).toFixed(1)}%` : "";
          const obs = [frText, soText].filter(Boolean).join(" · ");
          const isBad = (fillRate != null && fillRate < 0.95) || (stockout != null && stockout > 0.05);

          return {
            status: isBad ? "fail" : isChosen ? "pass" : "pass",
            label: isBad ? "KHÔNG ĐẠT" : isChosen ? "ĐẠT TỐI ƯU" : "ĐẠT (PASS)",
            observed: obs || "Đạt chuẩn an toàn cung ứng",
            note: isBad
              ? "Chưa đạt ngưỡng phục vụ mục tiêu tối thiểu."
              : isChosen
                ? "Đáp ứng tối ưu sự cân bằng giữa an toàn và chi phí."
                : "Đạt tiêu chí mức độ phục vụ.",
          };
        }
        return {
          status: "pass",
          label: "ĐẠT",
          observed: "Đạt chuẩn",
          note: "Theo số liệu giải thuật toán.",
        };
      }

      // Check specific finding code
      const stratFindings = ((st as any)?.critic?.findings as DecisionCriticFinding[] | undefined) ?? [];
      const matchFinding = stratFindings.find((f) => f.code === code) ?? globalFindings.find((f) => f.code === code);

      if (matchFinding) {
        const isFail = matchFinding.status === "fail" || matchFinding.severity === "critical";
        const isWarn = matchFinding.status === "warning" || matchFinding.severity === "warning";
        return {
          status: isFail ? "fail" : isWarn ? "warn" : "pass",
          label: isFail ? "KHÔNG ĐẠT" : isWarn ? "CẢNH BÁO" : "ĐẠT",
          observed: matchFinding.message || matchFinding.code || "Ghi nhận từ Critic Engine",
          note: matchFinding.message || "Được kiểm tra bởi hệ thống kiểm soát ràng buộc.",
        };
      }

      return {
        status: "pass",
        label: "ĐẠT (PASS)",
        observed: "Không phát hiện vi phạm",
        note: "Thỏa mãn ràng buộc này.",
      };
    };

    return {
      code,
      title: info.title,
      description: info.description,
      requirement: info.req,
      origin: "real",
      results: {
        lean: evaluateStrat("lean"),
        balanced: evaluateStrat("balanced"),
        protected: evaluateStrat("protected"),
      },
    };
  });

  const generateSummary = (stratKey: "lean" | "balanced" | "protected", label: string): StrategySummaryCardInfo => {
    const isChosen = brief.recommendation.strategy === stratKey && brief.recommendation.available;
    const st = strategyMap[stratKey];
    const isFeasible = st?.feasible !== false;
    const stratViolations = rawViolations[stratKey];
    const stratWarns = rawWarnings[stratKey];

    let passedCount = 0;
    checks.forEach((chk) => {
      if (chk.results[stratKey].status === "pass") passedCount += 1;
    });

    let statusTag: "pass" | "warn" | "fail" = "pass";
    let statusLabel = `${passedCount}/${checks.length} ĐẠT`;

    if (isChosen) {
      statusTag = "pass";
      statusLabel = `${passedCount}/${checks.length} ĐẠT · ✓ ĐÃ CHỌN`;
    } else if (!isFeasible || stratViolations.length > 0) {
      statusTag = "fail";
      statusLabel = `${passedCount}/${checks.length} Đạt · ✕ BỊ LOẠI`;
    } else if (stratWarns.length > 0) {
      statusTag = "warn";
      statusLabel = `${passedCount}/${checks.length} Đạt · ⚠ CẢNH BÁO`;
    }

    let reason = "";
    if (isChosen) {
      reason = "Phương án được thuật toán khuyến nghị: Thỏa mãn tối ưu các ràng buộc vận hành và chi phí.";
    } else if (stratViolations.length > 0) {
      reason = `Lý do loại: ${stratViolations.join(". ")}`;
    } else if (!isFeasible) {
      reason = "Lý do loại: Không tìm được phương án thỏa mãn toàn bộ các ràng buộc cứng của Solver.";
    } else if (stratWarns.length > 0) {
      reason = `Lưu ý: ${stratWarns.join(". ")}`;
    } else {
      reason = "Không được chọn làm phương án khuyến nghị tối ưu nhất theo hàm mục tiêu chi phí & rủi ro.";
    }

    return {
      strategy: stratKey,
      label,
      passedCount,
      totalCount: checks.length,
      statusTag,
      statusLabel,
      reason,
      origin: "real",
    };
  };

  const summaries = {
    lean: generateSummary("lean", "Tiết kiệm (P25)"),
    balanced: generateSummary("balanced", "Cân bằng (P50) ★"),
    protected: generateSummary("protected", "An toàn (P75)"),
  };

  return {
    origin: "real",
    originLabel: "Dữ liệu thực tế từ Solver Backend",
    isMockEnabled: isDecisionMockDiagnosticsEnabled(),
    hasRealCriticData: true,
    checks,
    summaries,
    rawViolations,
    rawWarnings,
  };
}

/**
 * Tạo bộ dữ liệu thẩm định ràng buộc MÔ PHỎNG MINH HỌA (Mock Diagnostics).
 * Được sử dụng khi người dùng kích hoạt biến môi trường NEXT_PUBLIC_ENABLE_DECISION_MOCK_DIAGNOSTICS
 * hoặc khi chạy trong môi trường demo/mock test.
 */
export function getMockCriticDiagnostics(
  brief: DecisionBriefFacts,
  remainingBudget = 15000000,
): DecisionDiagnosticsReport {
  const baseCost = brief.recommendation.total_purchase_cost ?? 5625000;

  const checks: CriticCheckItem[] = [
    {
      code: "HARD_BUDGET_CAP",
      title: "Hạn mức ngân sách tối đa",
      description: "Chi phí mua hàng của kịch bản không được vượt quá ngân sách khả dụng của cửa hàng.",
      requirement: `Chi phí mua ≤ ${formatVnd(remainingBudget)}`,
      origin: "mock",
      results: {
        lean: {
          status: "pass",
          label: "ĐẠT (PASS)",
          observed: `${formatVnd(Math.round(baseCost * 0.88))} (Chiếm 32% ngân sách)`,
          note: "Tối ưu nhất về mặt chi phí vốn bỏ ra ban đầu.",
        },
        balanced: {
          status: "pass",
          label: "ĐẠT TỐI ƯU",
          observed: `${formatVnd(baseCost)} (Chiếm 38% ngân sách)`,
          note: "Cân đối tốt giữa chi phí vốn và mức tồn an toàn.",
        },
        protected: {
          status: "warn",
          label: "CẢNH BÁO CHI PHÍ",
          observed: `${formatVnd(Math.round(baseCost * 1.15))} (Chiếm 43% ngân sách)`,
          note: "Chi phí tăng thêm ~15–20% so với phương án cân bằng.",
        },
      },
    },
    {
      code: "SERVICE_LEVEL_FLOOR",
      title: "Mức phục vụ mục tiêu (Target Service Level)",
      description: "Tỉ lệ đáp ứng nhu cầu khách hàng phải đạt ít nhất 95.0% và xác suất đứt hàng không quá 5.0%.",
      requirement: "Fill Rate ≥ 95.0% · Stockout Prob ≤ 5.0%",
      origin: "mock",
      results: {
        lean: {
          status: "fail",
          label: "KHÔNG ĐẠT (LÝ DO LOẠI)",
          observed: "Fill Rate: 92.0% · Xác suất thiếu hàng: 8.2%",
          note: "Rủi ro đứt hàng 8.2% vượt trần cho phép (5.0%), dễ gây mất doanh thu giờ cao điểm.",
        },
        balanced: {
          status: "pass",
          label: "ĐẠT TỐI ƯU",
          observed: "Fill Rate: 96.5% · Xác suất thiếu hàng: 3.8%",
          note: "Đạt chuẩn an toàn cung ứng với chi phí tối thiểu.",
        },
        protected: {
          status: "pass",
          label: "ĐẠT CAO",
          observed: "Fill Rate: 98.8% · Xác suất thiếu hàng: 1.5%",
          note: "Mức độ an toàn cao nhất nhưng đánh đổi bằng tồn kho lớn.",
        },
      },
    },
    {
      code: "EXPIRY_SAFETY_FLOOR",
      title: "Kiểm soát hạn sử dụng & Hao hụt (FEFO)",
      description: "Hạn chế tích trữ quá chu kỳ sử dụng của nguyên liệu tươi sống (sữa tươi, trái cây) gây hủy hàng quá date.",
      requirement: "Tồn kho dự trữ ≤ Chu kỳ date khả dụng (Tối đa 1% hao hụt)",
      origin: "mock",
      results: {
        lean: {
          status: "pass",
          label: "ĐẠT (PASS)",
          observed: "Hao hụt dự kiến: 0% (Tồn kho mỏng)",
          note: "Hầu như không có rủi ro hủy hàng do cận date.",
        },
        balanced: {
          status: "pass",
          label: "ĐẠT TỐI ƯU",
          observed: "Hao hụt dự kiến: < 0.5% (Tối ưu chu kỳ)",
          note: "Số lượng nhập vừa đủ tiêu thụ trong vòng 5–7 ngày.",
        },
        protected: {
          status: "fail",
          label: "CẢNH BÁO HAO HỤT (LÝ DO LOẠI)",
          observed: "Nguy cơ hao hụt quá date: ~3.2%",
          note: "Lượng nhập dư thừa cho các mặt hàng hạn ngắn (Sữa tươi, Cam, Chuối) làm tăng nguy cơ hết date.",
        },
      },
    },
    {
      code: "LEAD_TIME_FEASIBILITY",
      title: "Thời gian giao hàng khả thi (Lead Time Buffer)",
      description: "Ngày hàng về phải trước hoặc đúng ngày dự kiến cạn kiệt tồn kho an toàn.",
      requirement: "Lead time buffer ≥ 1 ngày đệm an toàn",
      origin: "mock",
      results: {
        lean: {
          status: "warn",
          label: "NGUY CƠ CAO (LÝ DO LOẠI)",
          observed: "Điểm đặt hàng sát ngày, Buffer đệm = 0 ngày",
          note: "Nếu nhà cung cấp giao trễ nửa ngày sẽ gây đứt hàng ngay lập tức.",
        },
        balanced: {
          status: "pass",
          label: "ĐẠT TỐI ƯU",
          observed: "Buffer an toàn: 1–2 ngày",
          note: "Đủ thời gian xử lý khi nhà cung cấp chậm giao thông thường.",
        },
        protected: {
          status: "pass",
          label: "ĐẠT (PASS)",
          observed: "Buffer an toàn: 3–4 ngày",
          note: "Đệm thời gian rất an toàn.",
        },
      },
    },
    {
      code: "SUPPLIER_MOQ_CHECK",
      title: "Số lượng đặt tối thiểu (MOQ)",
      description: "Mọi dòng đặt hàng phải đáp ứng số lượng tối thiểu từ nhà cung cấp.",
      requirement: "Order Qty ≥ MOQ quy định",
      origin: "mock",
      results: {
        lean: {
          status: "pass",
          label: "ĐẠT (PASS)",
          observed: "100% dòng mua đạt MOQ",
          note: "Phải làm tròn lên MOQ cho một số mặt hàng tiêu thụ ít.",
        },
        balanced: {
          status: "pass",
          label: "ĐẠT (PASS)",
          observed: "100% dòng mua đạt MOQ",
          note: "Cân đối tối ưu giữa nhu cầu và MOQ.",
        },
        protected: {
          status: "pass",
          label: "ĐẠT (PASS)",
          observed: "100% dòng mua đạt MOQ",
          note: "Dễ dàng vượt MOQ do lượng đặt hàng lớn.",
        },
      },
    },
    {
      code: "PACK_SIZE_ROUNDING",
      title: "Quy cách đóng gói (Pack Size Rounding)",
      description: "Số lượng đặt phải được làm tròn theo lốc/thùng nguyên vẹn của từng mặt hàng.",
      requirement: "Làm tròn chẵn nguyên thùng/gói",
      origin: "mock",
      results: {
        lean: {
          status: "pass",
          label: "ĐẠT (PASS)",
          observed: "Đã làm tròn số thùng cho toàn bộ dòng mua",
          note: "Làm tròn tối thiểu theo đơn vị đóng gói.",
        },
        balanced: {
          status: "pass",
          label: "ĐẠT (PASS)",
          observed: "Đã làm tròn số thùng cho toàn bộ dòng mua",
          note: "Đảm bảo đúng quy cách giao hàng của NCC.",
        },
        protected: {
          status: "pass",
          label: "ĐẠT (PASS)",
          observed: "Đã làm tròn số thùng cho toàn bộ dòng mua",
          note: "Làm tròn chẵn theo thùng nguyên.",
        },
      },
    },
  ];

  const summaries: Record<"lean" | "balanced" | "protected", StrategySummaryCardInfo> = {
    lean: {
      strategy: "lean",
      label: "Tiết kiệm (P25)",
      passedCount: 4,
      totalCount: 6,
      statusTag: "fail",
      statusLabel: "4/6 Đạt · ✕ 2 BỊ LOẠI",
      reason: "Lý do loại: Tỉ lệ thiếu hàng 8.2% vượt trần 5.0% · Điểm đặt hàng sát ngày không có đệm an toàn lead time.",
      origin: "mock",
    },
    balanced: {
      strategy: "balanced",
      label: "Cân bằng (P50) ★",
      passedCount: 6,
      totalCount: 6,
      statusTag: "pass",
      statusLabel: "6/6 ĐẠT · ✓ ĐÃ CHỌN",
      reason: "Đánh giá: Thỏa mãn 100% các ràng buộc cứng & mềm. Chi phí vốn và mức tồn an toàn tối ưu nhất.",
      origin: "mock",
    },
    protected: {
      strategy: "protected",
      label: "An toàn (P75)",
      passedCount: 4,
      totalCount: 6,
      statusTag: "warn",
      statusLabel: "4/6 Đạt · ⚠ 2 BỊ LOẠI",
      reason: "Lý do loại: Chi phí vốn tăng +16% · Tồn kho tươi sống dư thừa làm tăng nguy cơ hao hụt quá hạn FEFO (3.2%).",
      origin: "mock",
    },
  };

  const rawViolations: Record<"lean" | "balanced" | "protected", string[]> = {
    lean: ["Tồn kho đệm quá mỏng. Xác suất thiếu hụt nguyên liệu cao (8.2%)"],
    balanced: [],
    protected: ["Chi phí vốn mua hàng tăng cao và lượng tồn trữ lớn làm tăng rủi ro hao hụt hủy hàng"],
  };

  const rawWarnings: Record<"lean" | "balanced" | "protected", string[]> = {
    lean: ["Điểm đặt hàng sát ngày, Buffer đệm = 0 ngày"],
    balanced: [],
    protected: ["Nguy cơ hao hụt quá date: ~3.2% cho nguyên liệu tươi sống"],
  };

  return {
    origin: "mock",
    originLabel: "Dữ liệu mô phỏng minh họa (Mock)",
    isMockEnabled: true,
    hasRealCriticData: false,
    checks,
    summaries,
    rawViolations,
    rawWarnings,
  };
}

/**
 * Lấy báo cáo chẩn đoán thất bại & thẩm định ràng buộc phù hợp (tự động chọn giữa Real và Mock dựa trên ENV và dữ liệu thực tế).
 */
export function getDecisionDiagnosticsReport(
  brief: DecisionBriefFacts,
  decision?: DecisionPackage | null,
  remainingBudget = 15000000,
  forceMode?: DiagnosticOrigin,
): DecisionDiagnosticsReport {
  const isMockEnabled = isDecisionMockDiagnosticsEnabled();

  if (forceMode === "mock") {
    return getMockCriticDiagnostics(brief, remainingBudget);
  }

  const realReport = extractRealCriticDiagnostics(brief, decision, remainingBudget);

  if (forceMode === "real") {
    return realReport ?? {
      origin: "real",
      originLabel: "Dữ liệu thực tế từ Solver Backend",
      isMockEnabled,
      hasRealCriticData: false,
      checks: [],
      summaries: {
        lean: {
          strategy: "lean",
          label: "Tiết kiệm (P25)",
          passedCount: 0,
          totalCount: 0,
          statusTag: "pass",
          statusLabel: "Chưa có dữ liệu",
          reason: "Chưa có dữ liệu thẩm định từ Backend Solver.",
          origin: "real",
        },
        balanced: {
          strategy: "balanced",
          label: "Cân bằng (P50) ★",
          passedCount: 0,
          totalCount: 0,
          statusTag: "pass",
          statusLabel: "Chưa có dữ liệu",
          reason: "Chưa có dữ liệu thẩm định từ Backend Solver.",
          origin: "real",
        },
        protected: {
          strategy: "protected",
          label: "An toàn (P75)",
          passedCount: 0,
          totalCount: 0,
          statusTag: "pass",
          statusLabel: "Chưa có dữ liệu",
          reason: "Chưa có dữ liệu thẩm định từ Backend Solver.",
          origin: "real",
        },
      },
      rawViolations: { lean: [], balanced: [], protected: [] },
      rawWarnings: { lean: [], balanced: [], protected: [] },
    };
  }

  // Nếu có dữ liệu thật từ backend thì ưu tiên hiển thị dữ liệu thật
  if (realReport && realReport.checks.length > 0) {
    return realReport;
  }

  // Nếu không có dữ liệu thật mà ENV bật mock diagnostics -> dùng mock
  if (isMockEnabled) {
    return getMockCriticDiagnostics(brief, remainingBudget);
  }

  // Nếu không có dữ liệu thật và ENV tắt mock -> trả về báo cáo rỗng thực tế
  return realReport ?? {
    origin: "real",
    originLabel: "Dữ liệu thực tế từ Solver Backend",
    isMockEnabled: false,
    hasRealCriticData: false,
    checks: [],
    summaries: {
      lean: {
        strategy: "lean",
        label: "Tiết kiệm (P25)",
        passedCount: 0,
        totalCount: 0,
        statusTag: "pass",
        statusLabel: "Chưa có dữ liệu",
        reason: "Chưa có dữ liệu thẩm định từ Backend Solver.",
        origin: "real",
      },
      balanced: {
        strategy: "balanced",
        label: "Cân bằng (P50) ★",
        passedCount: 0,
        totalCount: 0,
        statusTag: "pass",
        statusLabel: "Chưa có dữ liệu",
        reason: "Chưa có dữ liệu thẩm định từ Backend Solver.",
        origin: "real",
      },
      protected: {
        strategy: "protected",
        label: "An toàn (P75)",
        passedCount: 0,
        totalCount: 0,
        statusTag: "pass",
        statusLabel: "Chưa có dữ liệu",
        reason: "Chưa có dữ liệu thẩm định từ Backend Solver.",
        origin: "real",
      },
    },
    rawViolations: { lean: [], balanced: [], protected: [] },
    rawWarnings: { lean: [], balanced: [], protected: [] },
  };
}
