import { describe, it, expect, vi } from "vitest";
import { hashCriativo } from "@/lib/meta/criativos";
import { marketingApiProvider } from "@/lib/meta/gateway/marketing-api";

// Fase 2, base: o criativo é guardado por VERSÃO. Miniatura assinada muda toda hora e não conta.

describe("versão do criativo", () => {
  const base = { adId: "1", creativeId: "c1", tipo: "VIDEO", videoId: "v1", body: "Você é da região dos lagos…", title: "Contele" };
  it("mesma versão com miniatura diferente = mesmo hash; texto diferente = outro", () => {
    expect(hashCriativo({ ...base, thumbUrl: "https://a/x?oh=1" })).toBe(hashCriativo({ ...base, thumbUrl: "https://a/x?oh=2" }));
    expect(hashCriativo({ ...base, body: "outro texto" })).not.toBe(hashCriativo(base));
  });
});

describe("Marketing API: criativos em lote", () => {
  it("pede miniatura 1080, divide em lotes de 50 e mapeia os campos", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      urls.push(u);
      const ids = new URL(u).searchParams.get("ids")!.split(",");
      const corpo: Record<string, unknown> = {};
      for (const id of ids) corpo[id] = { name: `Ad ${id}`, effective_status: "ACTIVE", creative: { id: `c${id}`, object_type: "VIDEO", thumbnail_url: "https://t/x", video_id: `v${id}`, body: "b", title: "t", call_to_action_type: "WHATSAPP_MESSAGE", asset_feed_spec: {} } };
      return new Response(JSON.stringify(corpo), { status: 200 });
    });
    const ids = Array.from({ length: 120 }, (_, i) => String(1000 + i));
    const r = await marketingApiProvider.criativos({ token: "tok", adIds: [...ids, ids[0]] });
    expect(urls).toHaveLength(3);
    expect(decodeURIComponent(urls[0])).toContain("thumbnail_width(1080).thumbnail_height(1080)");
    expect(r).toHaveLength(120);
    expect(r[0]).toMatchObject({ adId: "1000", tipo: "VIDEO", videoId: "v1000", cta: "WHATSAPP_MESSAGE", assetFeedSpec: null });
    vi.unstubAllGlobals();
  });
});
