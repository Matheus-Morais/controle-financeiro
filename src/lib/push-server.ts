import "server-only";
import webpush from "web-push";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error("Chaves VAPID ausentes no servidor.");
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushResult {
  ok: boolean;
  /** Endpoint expirou (HTTP 404/410): o chamador deve remover a subscription. */
  gone: boolean;
  /** Status HTTP devolvido pelo push service quando a entrega falha. */
  status?: number;
}

/** Envia uma notificação para uma subscription. */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushResult> {
  try {
    ensureConfigured();
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
    );
    return { ok: true, gone: false };
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) return { ok: false, gone: true, status };
    console.error("Erro ao enviar push:", err);
    return { ok: false, gone: false, status };
  }
}
