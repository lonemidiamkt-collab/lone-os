import { describe, it, expect, afterEach } from "vitest";
import dns from "node:dns";
import net from "node:net";
import { usarSoIpv4 } from "@/lib/rede/so-ipv4";

// 29/10/2026: "fetch failed / AggregateError ETIMEDOUT" ~270 ms depois de começar a chamada — o relógio
// de 250 ms do "happy eyeballs" do Node pulava para o IPv6, que não existe no container.

const ordemOriginal = dns.getDefaultResultOrder();
const autoOriginal = net.getDefaultAutoSelectFamily();
afterEach(() => { dns.setDefaultResultOrder(ordemOriginal); net.setDefaultAutoSelectFamily(autoOriginal); });

describe("usarSoIpv4", () => {
  it("desliga a escolha automática de IPv6 e põe o IPv4 primeiro", () => {
    net.setDefaultAutoSelectFamily(true);
    expect(usarSoIpv4({})).toBe(true);
    expect(net.getDefaultAutoSelectFamily()).toBe(false);
    expect(dns.getDefaultResultOrder()).toBe("ipv4first");
  });
  it("REDE_IPV6=1 deixa o padrão do Node", () => {
    net.setDefaultAutoSelectFamily(true);
    expect(usarSoIpv4({ REDE_IPV6: "1" })).toBe(false);
    expect(net.getDefaultAutoSelectFamily()).toBe(true);
  });
});
