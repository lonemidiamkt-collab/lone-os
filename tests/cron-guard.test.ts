// @vitest-environment node
// tests/cron-guard.test.ts — Fase 0, leva 0D (25/11/2026).
//  · o segredo do cron é comparado em tempo constante (timingSafeEqual), não com ===;
//  · requireCronOrRole: cron OU um dos papéis — "qualquer logado" deixava designer e comercial
//    dispararem o brief do tráfego no WhatsApp (?forcar=1), trocar a cobrança de conta de anúncio e
//    rodar a varredura da Defesa Ativa.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

const sessao = vi.hoisted(() => ({ user: null as null | { id: string; email: string; isAdmin: boolean; papel?: string | null } }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => sessao.user }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: () => { throw new Error("não devia consultar"); } } }));

const { isCronRequest, requireCron, requireCronOrRole } = await import("@/lib/api/cron-guard");

const pedido = (auth?: string) => new NextRequest("http://x/api/system/qualquer", { method: "POST", headers: auth ? { Authorization: auth } : undefined });
const SEGREDO = "segredo-de-teste-0123456789";

beforeEach(() => { vi.stubEnv("CRON_SECRET", SEGREDO); sessao.user = null; });
afterEach(() => { vi.unstubAllEnvs(); });

describe("segredo do cron", () => {
  it("aceita só o segredo exato (com ou sem espaço, Bearer em qualquer caixa)", () => {
    expect(isCronRequest(pedido(`Bearer ${SEGREDO}`))).toBe(true);
    expect(isCronRequest(pedido(`bearer   ${SEGREDO} `))).toBe(true);
    expect(isCronRequest(pedido(`Bearer ${SEGREDO}x`))).toBe(false);
    expect(isCronRequest(pedido(`Bearer ${SEGREDO.slice(0, -1)}`))).toBe(false);
    expect(isCronRequest(pedido("Bearer "))).toBe(false);
    expect(isCronRequest(pedido())).toBe(false);
    expect(requireCron(pedido("Bearer errado"))?.status).toBe(401);
  });

  it("sem CRON_SECRET configurado ninguém passa como cron (nem com cabeçalho vazio)", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronRequest(pedido("Bearer "))).toBe(false);
    expect(isCronRequest(pedido("Bearer undefined"))).toBe(false);
  });

  it("compara em tempo constante (timingSafeEqual), não com ===", () => {
    const src = readFileSync("lib/api/cron-guard.ts", "utf8");
    expect(src).toMatch(/timingSafeEqual/);
    expect(src).not.toMatch(/secret === process\.env\.CRON_SECRET/);
  });
});

describe("cron ou papel", () => {
  const TRAFEGO = ["admin", "manager", "traffic"] as const;

  it("cron passa; tráfego e gestão passam; designer e comercial levam 403; sem login, 401", async () => {
    expect(await requireCronOrRole(pedido(`Bearer ${SEGREDO}`), [...TRAFEGO])).toBeNull();
    sessao.user = { id: "u", email: "t@exemplo.test", isAdmin: false, papel: "traffic" };
    expect(await requireCronOrRole(pedido("Bearer jwt"), [...TRAFEGO])).toBeNull();
    sessao.user = { id: "u", email: "a@exemplo.test", isAdmin: true, papel: "social" };
    expect(await requireCronOrRole(pedido("Bearer jwt"), [...TRAFEGO])).toBeNull(); // admin pela sessão
    for (const papel of ["designer", "comercial", "social", null]) {
      sessao.user = { id: "u", email: "d@exemplo.test", isAdmin: false, papel };
      expect((await requireCronOrRole(pedido("Bearer jwt"), [...TRAFEGO]))?.status, String(papel)).toBe(403);
    }
    sessao.user = null;
    expect((await requireCronOrRole(pedido(), [...TRAFEGO]))?.status).toBe(401);
  });

  it("as rotas que mandam no WhatsApp ou mexem na conta de anúncio usam cron OU papel", () => {
    for (const f of ["app/api/system/traffic-brief-segunda/route.ts", "app/api/traffic/billing-type/route.ts", "app/api/system/defense-scan/route.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/requireCronOrRole\(req, /);
      expect(src, f).not.toMatch(/requireCronOrUser\(req\)/);
    }
  });
});
