import { NextResponse } from "next/server";

export async function GET() {
  try {
    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;

    if (!scriptUrl) {
      return NextResponse.json(
        { ok: false, error: "GOOGLE_SCRIPT_URL이 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const url = `${scriptUrl}?action=get_members`;

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });

    const text = await response.text();

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: "Apps Script 응답이 JSON이 아님", raw: text };
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "알 수 없는 오류",
      },
      { status: 500 }
    );
  }
}