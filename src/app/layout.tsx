import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ResumeRefresh } from "@/components/resume-refresh";

export const metadata: Metadata = {
  title: "Controle Financeiro",
  description: "Controle financeiro pessoal — cartões, gastos, parcelas e recebimentos.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Finanças",
  },
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * Aplica a preferência de "ocultar valores" ANTES da primeira pintura.
 *
 * A preferência é por aparelho (`localStorage`), então o servidor não a conhece
 * e o HTML sai sempre com os valores visíveis. Sem este script, quem deixou os
 * valores ocultos veria todos eles piscarem na tela a cada carga — que é
 * exatamente o que a opção existe para evitar.
 */
const APPLY_HIDE_VALUES = `try{if(localStorage.getItem("cf:hide-values"))document.documentElement.dataset.hideValues=""}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_HIDE_VALUES }} />
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
        <ResumeRefresh />
      </body>
    </html>
  );
}
