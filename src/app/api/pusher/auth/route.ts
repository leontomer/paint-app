import { NextRequest, NextResponse } from "next/server";
import { getPusherServer } from "@/lib/pusher-server";

function sanitizeUserValue(input: string | null, fallback: string): string {
  const value = (input ?? "").trim();
  if (!value) return fallback;
  return value.slice(0, 40);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const form = await req.formData();
    const socketId = form.get("socket_id")?.toString();
    const channel = form.get("channel_name")?.toString();

    if (!socketId || !channel) {
      return NextResponse.json({ error: "Invalid auth payload." }, { status: 400 });
    }

    const userId = sanitizeUserValue(form.get("userId")?.toString() ?? null, crypto.randomUUID());
    const userName = sanitizeUserValue(form.get("userName")?.toString() ?? null, `Painter-${userId.slice(0, 6)}`);

    const auth = getPusherServer().authorizeChannel(socketId, channel, {
      user_id: userId,
      user_info: { name: userName }
    });

    return NextResponse.json(auth);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auth failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
