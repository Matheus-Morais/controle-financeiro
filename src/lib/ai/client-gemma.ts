/**
 * Adapter para detecção e execução da IA no dispositivo (Gemma / Gemini Nano)
 * via Prompt API nativa do navegador (Google Chrome no Android/Desktop).
 */

declare global {
  interface Window {
    ai?: {
      languageModel?: {
        availability?: () => Promise<string>;
        capabilities?: () => Promise<{ available: string }>;
        create?: (options?: { systemPrompt?: string }) => Promise<{
          prompt: (text: string) => Promise<string>;
          destroy?: () => void;
        }>;
      };
    };
  }
}

export interface LocalAiStatus {
  available: boolean;
  modelName: string;
  reason?: string;
}

/**
 * Checa se o navegador do dispositivo tem suporte à Prompt API local (Gemma / Gemini Nano).
 */
export async function checkGemmaAvailability(): Promise<LocalAiStatus> {
  if (typeof window === "undefined") {
    return { available: false, modelName: "Nenhum", reason: "Executando fora do navegador" };
  }

  const lm = window.ai?.languageModel;
  if (!lm || typeof lm.create !== "function") {
    return {
      available: false,
      modelName: "Gemma / Gemini Nano",
      reason: "Prompt API não habilitada no navegador",
    };
  }

  try {
    if (typeof lm.availability === "function") {
      const status = await lm.availability();
      if (status === "readily" || status === "available") {
        return { available: true, modelName: "Gemma (No Aparelho)" };
      }
      return {
        available: false,
        modelName: "Gemma (No Aparelho)",
        reason: `Status da IA local: ${status}`,
      };
    }

    if (typeof lm.capabilities === "function") {
      const caps = await lm.capabilities();
      if (caps.available === "readily" || caps.available === "after-download") {
        return { available: true, modelName: "Gemma (No Aparelho)" };
      }
      return {
        available: false,
        modelName: "Gemma (No Aparelho)",
        reason: `Disponibilidade: ${caps.available}`,
      };
    }

    // Se possui .create mas sem método de disponibilidade, tenta criação direta
    return { available: true, modelName: "Gemma (No Aparelho)" };
  } catch (err) {
    return {
      available: false,
      modelName: "Gemma (No Aparelho)",
      reason: "Erro ao consultar suporte local",
    };
  }
}

/**
 * Executa a inferência diretamente no hardware do dispositivo usando a Prompt API.
 */
export async function promptGemma(systemPrompt: string, userPrompt: string): Promise<string> {
  const lm = window.ai?.languageModel;
  if (!lm || typeof lm.create !== "function") {
    throw new Error("IA local não disponível neste navegador.");
  }

  const session = await lm.create({ systemPrompt });
  try {
    const response = await session.prompt(userPrompt);
    return response;
  } finally {
    session.destroy?.();
  }
}
