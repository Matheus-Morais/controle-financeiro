import { describe, expect, it } from "vitest";
import { config } from "./middleware";

/**
 * Trava do matcher (RN-49).
 *
 * O bug que este teste existe para impedir: sem `api/` na negação, a requisição
 * do Vercel Cron — que não carrega cookie de sessão — era interceptada pelo
 * middleware e redirecionada para `/login` com 307, **antes** de a rota validar
 * o `CRON_SECRET`. Resultado: nenhum push enviado e nenhuma renda recorrente
 * materializada desde o deploy, sem nenhum sinal de erro.
 *
 * O padrão do Next é compilado por path-to-regexp, que aqui só repassa o grupo
 * regex literal — então avaliá-lo como RegExp reproduz a decisão de casamento.
 */
const matcher = config.matcher[0];
const re = new RegExp(`^${matcher}$`);

const matches = (path: string) => re.test(path);

describe("matcher do middleware", () => {
  it("NÃO intercepta rotas de API — cada uma faz a própria autorização", () => {
    expect(matches("/api/cron/notifications")).toBe(false);
    expect(matches("/api/export")).toBe(false);
    expect(matches("/api/faturas/importar")).toBe(false);
  });

  it("intercepta as rotas da aplicação (é onde a sessão é renovada)", () => {
    expect(matches("/")).toBe(true);
    expect(matches("/cartoes")).toBe(true);
    expect(matches("/cartoes/abc-123")).toBe(true);
    expect(matches("/gastos/novo")).toBe(true);
    expect(matches("/login")).toBe(true);
    expect(matches("/onboarding")).toBe(true);
  });

  it("não intercepta estáticos, service worker, manifest e ícones", () => {
    expect(matches("/_next/static/chunk.js")).toBe(false);
    expect(matches("/_next/image")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
    expect(matches("/sw.js")).toBe(false);
    expect(matches("/manifest.webmanifest")).toBe(false);
    expect(matches("/icons/icon-192.png")).toBe(false);
    expect(matches("/logo.svg")).toBe(false);
    expect(matches("/logo-maskable.svg")).toBe(false);
  });

  it("não confunde uma rota da app que apenas começa com 'api'", () => {
    // A negação é `api/` (com barra), então /apitest continua protegido.
    expect(matches("/apitest")).toBe(true);
  });
});
