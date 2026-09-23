"use client";

export type SerializedSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Converte a VAPID public key (base64url) para o formato aceito pelo pushManager. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function vapidKey(): Uint8Array {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY ausente.");
  return urlBase64ToUint8Array(key);
}

/**
 * A subscription foi criada com a chave VAPID atual? Uma subscription feita com
 * uma chave antiga continua "ativa" no navegador, mas o push service recusa
 * todo envio assinado com a chave nova — na prática, está morta.
 */
function matchesCurrentKey(sub: PushSubscription): boolean {
  const key = sub.options.applicationServerKey;
  if (!key) return true; // navegador não expõe a chave: não dá para afirmar que é velha
  const a = new Uint8Array(key);
  const b = vapidKey();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Pede permissão e assina o Web Push. Retorna a subscription serializada
 * (endpoint + chaves) pronta para persistir no Supabase.
 */
export async function subscribeToPush(): Promise<SerializedSubscription | null> {
  if (!pushSupported()) throw new Error("Push não suportado neste dispositivo/navegador.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;

  // Subscription com chave antiga faz o subscribe() falhar (InvalidStateError):
  // descarta antes de assinar de novo.
  const existing = await registration.pushManager.getSubscription();
  if (existing && !matchesCurrentKey(existing)) await existing.unsubscribe();

  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidKey() as BufferSource,
  });

  return serialize(sub);
}

/**
 * Retorna a subscription já existente neste dispositivo, se houver e se ainda
 * for utilizável (permissão concedida e chave VAPID atual). Uma subscription
 * inutilizável é cancelada aqui, para a tela voltar a oferecer "Ativar".
 */
export async function getExistingSubscription(): Promise<SerializedSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return null;
  if (Notification.permission !== "granted" || !matchesCurrentKey(sub)) {
    await sub.unsubscribe();
    return null;
  }
  return serialize(sub);
}

/** Cancela a assinatura de push neste dispositivo. Retorna o endpoint removido. */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}

function serialize(sub: PushSubscription): SerializedSubscription {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
  };
}
