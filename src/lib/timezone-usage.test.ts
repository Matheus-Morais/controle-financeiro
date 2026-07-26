import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Teste de arquitetura para o invariante RN-08: toda decisão de calendário usa o
 * timezone DO USUÁRIO (`profiles.timezone`), nunca o default do servidor.
 *
 * `currentReferenceMonth()` e `todayISO()` têm um default de conveniência
 * (`America/Sao_Paulo`) — e era exatamente esse default que vazava para quase
 * todas as telas: só o dashboard passava o `tz`. Para um usuário fora do
 * Brasil, na virada do mês o dashboard mostrava agosto e a tela do cartão,
 * julho; pior, o corte de ciclo da troca de cartão gravava o mês errado, com
 * efeito permanente no dado.
 *
 * Chamada sem argumento passa a ser proibida fora dos módulos que definem ou
 * resolvem o timezone. Use `sessionTimezone(db)` (páginas) ou
 * `userTimezone(db, userId)` / `userCurrentReferenceMonth` (Server Actions),
 * ambos em `user-time.ts`.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** Módulos autorizados: um define os helpers, o outro resolve o timezone. */
const ALLOWED = ["lib\\date.ts", "lib/date.ts", "lib\\user-time.ts", "lib/user-time.ts"];

/** `currentReferenceMonth()` ou `todayISO()` — parênteses vazios, sem `tz`. */
const NO_ARG_CALL = /\b(currentReferenceMonth|todayISO)\(\s*\)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("RN-08 — timezone do usuário", () => {
  it("nenhum módulo chama currentReferenceMonth()/todayISO() sem timezone", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      if (ALLOWED.some((a) => file.endsWith(a))) continue;
      const source = readFileSync(file, "utf8");
      for (const [i, line] of source.split("\n").entries()) {
        // Ignora comentários — o texto explicativo cita as funções.
        const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, "");
        if (NO_ARG_CALL.test(code)) {
          offenders.push(`${file.slice(SRC.length)}:${i + 1} → ${line.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
