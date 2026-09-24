// cn() e os tamanhos lone-*: o twMerge tratava text-lone-caption como cor e, se a lista trazia uma
// cor de texto, descartava o tamanho (badges do painel comparativo saíam em 16px em vez de 11px).
import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn com tamanhos lone-*", () => {
  it("tamanho lone-* + cor de texto: os dois ficam", () => {
    expect(cn("text-lone-caption", "text-primary")).toBe("text-lone-caption text-primary");
    expect(cn("text-lone-h2 text-muted-foreground")).toBe("text-lone-h2 text-muted-foreground");
  });
  it("dois tamanhos: vale o último, como sempre", () => {
    expect(cn("text-lone-caption", "text-lone-h1")).toBe("text-lone-h1");
    expect(cn("text-sm", "text-lone-body")).toBe("text-lone-body");
  });
  it("duas cores: vale a última", () => {
    expect(cn("text-foreground", "text-primary")).toBe("text-primary");
  });
});
