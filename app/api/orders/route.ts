import { createPurchaseOrders } from "../../../lib/logic";
import type { Recommendation, Strategy } from "../../../lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      recommendations?: Recommendation[];
      strategy?: Strategy;
      today?: string;
      remainingBudget?: number;
    };
    if (
      !body.recommendations ||
      !body.strategy ||
      !body.today ||
      typeof body.remainingBudget !== "number"
    ) {
      return Response.json(
        { message: "Thiếu dữ liệu để tạo đơn." },
        { status: 400 },
      );
    }
    const orders = createPurchaseOrders(
      body.recommendations,
      body.strategy,
      body.today,
      body.remainingBudget,
    );
    return Response.json({ orders });
  } catch {
    return Response.json(
      { message: "Không thể tạo đơn đặt hàng." },
      { status: 500 },
    );
  }
}
