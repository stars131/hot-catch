import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/errors";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(error: unknown) {
  const { status, body } = toErrorResponse(error);
  return NextResponse.json(body, { status });
}
