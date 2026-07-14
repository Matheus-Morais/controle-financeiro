"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed) return null;

  // Android / desktop: prompt nativo disponível
  if (deferred) {
    return (
      <button
        onClick={async () => {
          await deferred.prompt();
          setDeferred(null);
        }}
        className="flex items-center justify-center gap-2 rounded-2xl bg-brand p-3 text-sm font-semibold text-white shadow-sm"
      >
        <Download size={18} /> Instalar o app na tela inicial
      </button>
    );
  }

  // iOS: sem prompt nativo, mostra instruções
  if (isIOS) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-dashed border-neutral-300 p-3 text-sm dark:border-neutral-700">
        <Share size={18} className="mt-0.5 shrink-0 text-brand" />
        <span>
          Para instalar e receber notificações no iPhone: toque em <b>Compartilhar</b> e depois em{" "}
          <b>Adicionar à Tela de Início</b>.
        </span>
      </div>
    );
  }

  return null;
}
