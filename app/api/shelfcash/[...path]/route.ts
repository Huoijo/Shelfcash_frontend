import { forwardShelfCashRequest } from "../../../../lib/backend-proxy";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function forward(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return forwardShelfCashRequest(request, path);
}

export async function GET(request: Request, context: RouteContext) {
  return forward(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return forward(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return forward(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return forward(request, context);
}
