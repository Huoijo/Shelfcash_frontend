import { buildPlan } from "../../../lib/logic";
import type { BootstrapData, Strategy } from "../../../lib/types";

const validStrategies = new Set<Strategy>(["Tiết kiệm", "Cân bằng", "An toàn"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      data?: BootstrapData;
      strategy?: Strategy;
    };
    if (!body.data || !body.strategy || !validStrategies.has(body.strategy)) {
      return Response.json(
        { message: "Thiếu dữ liệu hoặc chiến lược không hợp lệ." },
        { status: 400 },
      );
    }
    return Response.json(buildPlan(body.data, body.strategy));
  } catch {
    return Response.json(
      { message: "Không thể lập kế hoạch lúc này." },
      { status: 500 },
    );
  }
}
