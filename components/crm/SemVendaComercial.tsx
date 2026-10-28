"use client";

// components/crm/SemVendaComercial.tsx — aba Fechados: quem entrou no Lone OS sem venda no Comercial (28/10/2026).
// "Registrar a venda" cria o lead Ganho já ligado ao cadastro; "Não foi venda" tira da lista (segunda loja,
// contrato duplo, cliente antigo). lib/crm/sem-venda.ts.

import { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { Button } from "@/components/ui/button";
import type { ClienteSemVenda } from "@/lib/crm/sem-venda";

const fmt = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
const CADASTRO: Record<ClienteSemVenda["cadastro"], string> = {
  link: "link de cadastro ainda não preenchido", aprovacao: "cadastro esperando aprovação", completo: "já é cliente",
};
const MOTIVOS = ["Segunda loja do mesmo contrato", "Cliente antigo, voltou", "Parceria / permuta", "Outro"];

export default function SemVendaComercial({ onMudou }: { onMudou: () => void }) {
  const [lista, setLista] = useState<ClienteSemVenda[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<{ id: string; modo: "venda" | "dispensa" } | null>(null);
  const [valor, setValor] = useState("");
  const [implantacao, setImplantacao] = useState("");
  const [data, setData] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    const r = await chamar<{ clientes: ClienteSemVenda[] }>("/api/crm/sem-venda");
    if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui ler os clientes sem venda."); return; }
    setErro(null);
    setLista(r.data.clientes);
  };
  useEffect(() => { void carregar(); }, []);

  const abrir = (c: ClienteSemVenda, modo: "venda" | "dispensa") => {
    setAberto({ id: c.clientId, modo }); setValor(""); setImplantacao(""); setData(c.entrouEm); setMotivo(MOTIVOS[0]); setErro(null);
  };

  const salvar = async () => {
    if (!aberto) return;
    setSalvando(true);
    const corpo = aberto.modo === "venda"
      ? { acao: "registrar", clientId: aberto.id, valorMensal: Number(valor.replace(",", ".")), valorImplantacao: implantacao ? Number(implantacao.replace(",", ".")) : null, fechadoEm: data }
      : { acao: "dispensar", clientId: aberto.id, motivo };
    const r = await chamar("/api/crm/sem-venda", corpo);
    setSalvando(false);
    if (!r.ok) { setErro(r.erro ?? "Não consegui gravar."); return; }
    setAberto(null);
    await carregar();
    if (aberto.modo === "venda") onMudou();
  };

  if (lista && !lista.length && !erro) return null;
  return (
    <section className={`rounded-2xl border bg-card shadow-sm dark:shadow-none ${lista?.length ? "border-lone-warning-border" : "border-border"}`}>
      <div className="flex flex-wrap items-baseline gap-2 px-5 py-3.5">
        <h2 className="text-lone-h2 text-foreground">Entraram sem venda no Comercial</h2>
        <span className="text-lone-caption text-muted-foreground">
          {lista?.length ?? "…"} · cliente que entrou pelo &quot;Novo cliente&quot; — registre a venda para a meta, os relatórios e o Finance verem
        </span>
      </div>
      {erro && <p className="border-t border-border px-5 py-3 text-lone-caption text-lone-danger">{erro}</p>}
      {!lista ? (
        <div className="flex justify-center border-t border-border py-4"><Loader2 size={16} className="animate-spin text-primary" /></div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {lista.map((c) => (
            <li key={c.clientId} className="space-y-2 px-5 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lone-body font-medium text-foreground">{c.nome}</div>
                  <div className="truncate text-lone-caption text-muted-foreground">Entrou em {fmt(c.entrouEm)} · {CADASTRO[c.cadastro]}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => abrir(c, "venda")} className="gap-1.5"><UserPlus size={14} /> Registrar a venda</Button>
                  <Button size="sm" variant="outline" onClick={() => abrir(c, "dispensa")}>Não foi venda</Button>
                </div>
              </div>
              {aberto?.id === c.clientId && (
                <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3">
                  {aberto.modo === "venda" ? (
                    <>
                      <label className="text-lone-caption text-muted-foreground">Mensalidade (R$)
                        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus
                          className="mt-1 block h-8 w-28 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
                      </label>
                      <label className="text-lone-caption text-muted-foreground">Implantação (R$, opcional)
                        <input inputMode="decimal" value={implantacao} onChange={(e) => setImplantacao(e.target.value)}
                          className="mt-1 block h-8 w-28 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
                      </label>
                      <label className="text-lone-caption text-muted-foreground">Fechou em
                        <input type="date" value={data} onChange={(e) => setData(e.target.value)}
                          className="mt-1 block h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
                      </label>
                    </>
                  ) : (
                    <label className="text-lone-caption text-muted-foreground">Por quê
                      <select value={motivo} onChange={(e) => setMotivo(e.target.value)}
                        className="mt-1 block h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground">
                        {MOTIVOS.map((m) => <option key={m}>{m}</option>)}
                      </select>
                    </label>
                  )}
                  <Button size="sm" onClick={() => void salvar()} disabled={salvando || (aberto.modo === "venda" && !(Number(valor.replace(",", ".")) > 0))}>
                    {salvando ? <Loader2 size={14} className="animate-spin" /> : aberto.modo === "venda" ? "Gravar venda" : "Tirar da lista"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAberto(null)}>Cancelar</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
