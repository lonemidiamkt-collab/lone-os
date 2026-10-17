"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, FileJson, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chamar } from "@/lib/api/chamar";
import { useRole } from "@/lib/context/RoleContext";
import { podeVerComercial } from "@/lib/crm/acesso";
import { brl } from "@/lib/crm/meta";
import type { Plano } from "@/lib/crm/importar";

// /crm/importar — põe no funil as lojas da rota, as oportunidades (com mensalidade) e os cadastros
// recentes da planilha do site. Prévia linha a linha antes de gravar; rodar de novo não duplica.
// Os arquivos ficam no computador do Roberto: nada disso vai para o repositório.

type Resultado = { criados: number; atualizados: number; erros: { titulo: string; erro: string }[] };

const ROTULO_FONTE = { rota: "Rota", oportunidade: "Oportunidade", planilha: "Site" } as const;
const COR_ACAO = {
  criar: "border-lone-success-border bg-lone-success-bg text-lone-success",
  atualizar: "border-lone-info-border bg-lone-info-bg text-lone-info",
  ignorar: "border-border bg-muted text-muted-foreground",
} as const;

export default function ImportarComercialPage() {
  const { role } = useRole();
  const [dados, setDados] = useState<unknown>(null);
  const [nomeDados, setNomeDados] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [nomeCsv, setNomeCsv] = useState<string | null>(null);
  const [plano, setPlano] = useState<Plano | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [busy, setBusy] = useState<"previa" | "importar" | null>(null);
  const [verIgnorados, setVerIgnorados] = useState(false);

  if (!podeVerComercial(role)) return <div className="p-8 text-lone-body text-lone-danger">Esta área é só de quem cuida do comercial.</div>;

  async function lerArquivo(f: File | undefined, tipo: "json" | "csv") {
    if (!f) return;
    const texto = await f.text();
    setPlano(null); setResultado(null);
    if (tipo === "json") {
      try { setDados(JSON.parse(texto)); setNomeDados(f.name); }
      catch { toast.error("Esse arquivo não é um JSON válido."); }
    } else { setCsv(texto); setNomeCsv(f.name); }
  }

  async function enviar(confirmar: boolean) {
    setBusy(confirmar ? "importar" : "previa");
    const r = await chamar<{ plano: Plano; resultado?: Resultado }>("/api/crm/importar", { dados: dados ?? undefined, csv: csv ?? undefined, confirmar });
    setBusy(null);
    if (!r.ok || !r.data) { toast.error(r.erro ?? "Não consegui processar."); return; }
    setPlano(r.data.plano);
    if (r.data.resultado) {
      setResultado(r.data.resultado);
      if (r.data.resultado.erros.length) toast.warning(`${r.data.resultado.erros.length} linha(s) com erro — veja abaixo.`);
      else toast.success(`${r.data.resultado.criados} lead(s) criado(s), ${r.data.resultado.atualizados} atualizado(s).`);
    }
  }

  const linhasVisiveis = plano ? plano.linhas.filter((l) => verIgnorados || l.acao !== "ignorar") : [];

  return (
    <div className="space-y-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 pr-12">
        <div>
          <Link href="/crm" className="mb-1 inline-flex items-center gap-1 text-lone-caption text-muted-foreground hover:text-foreground"><ArrowLeft size={13} /> Comercial</Link>
          <h1 className="text-lone-h1 tracking-tight text-foreground">Importar para o comercial</h1>
          <p className="text-lone-caption text-muted-foreground">Lojas da rota, oportunidades e cadastros do site. Prévia antes de gravar; rodar de novo não duplica.</p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-border bg-card p-5 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-lone-h2 text-foreground"><FileJson size={16} className="text-muted-foreground" /> Rota e oportunidades</span>
          <span className="text-lone-caption text-muted-foreground">O arquivo <code>dados-iniciais.json</code> (pasta lone-comercial). Traz a mensalidade de cada oportunidade.</span>
          <span className="text-lone-body text-foreground">{nomeDados ?? "Escolher arquivo…"}</span>
          <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => lerArquivo(e.target.files?.[0], "json")} />
        </label>
        <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-border bg-card p-5 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-lone-h2 text-foreground"><FileSpreadsheet size={16} className="text-muted-foreground" /> Planilha do site</span>
          <span className="text-lone-caption text-muted-foreground">Na planilha &quot;Leads Site - Lone Mídia&quot;: Arquivo → Fazer download → CSV. Entram os cadastros dos últimos 90 dias; lixo e testes ficam de fora.</span>
          <span className="text-lone-body text-foreground">{nomeCsv ?? "Escolher arquivo…"}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => lerArquivo(e.target.files?.[0], "csv")} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={(!dados && !csv) || !!busy} onClick={() => enviar(false)}>
          {busy === "previa" ? "Montando a prévia…" : "Ver prévia"}
        </Button>
        {plano && !resultado && (plano.totais.criar + plano.totais.atualizar > 0) && (
          <Button disabled={!!busy} onClick={() => enviar(true)}>
            <Upload size={15} className="mr-1" />
            {busy === "importar" ? "Importando…" : `Importar ${plano.totais.criar + plano.totais.atualizar} lead(s)`}
          </Button>
        )}
      </div>

      {resultado && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-lone-h2 text-foreground">Importação concluída</h2>
          <p className="mt-1 text-lone-body text-muted-foreground">{resultado.criados} criado(s) · {resultado.atualizados} atualizado(s){resultado.erros.length ? ` · ${resultado.erros.length} com erro` : ""}.</p>
          {resultado.erros.length > 0 && (
            <ul className="mt-3 space-y-1 text-lone-caption text-lone-danger">
              {resultado.erros.map((e, i) => <li key={i}>{e.titulo}: {e.erro}</li>)}
            </ul>
          )}
          <Link href="/crm" className="mt-3 inline-block text-lone-caption text-primary hover:underline">Abrir o funil</Link>
        </section>
      )}

      {plano && (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lone-h2 text-foreground">Prévia</h2>
            <p className="text-lone-caption text-muted-foreground">
              {plano.totais.criar} a criar · {plano.totais.atualizar} a atualizar · {plano.totais.ignorar} ignorado(s)
              {plano.totais.mensalidade > 0 ? ` · ${brl(plano.totais.mensalidade)}/mês em negociação` : ""}
            </p>
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-lone-caption text-muted-foreground">
            <input type="checkbox" checked={verIgnorados} onChange={(e) => setVerIgnorados(e.target.checked)} /> Mostrar os ignorados (e o porquê)
          </label>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-lone-caption">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Origem</th>
                  <th className="py-1.5 pr-3 font-medium">Empresa</th>
                  <th className="py-1.5 pr-3 font-medium">Ação</th>
                  <th className="py-1.5 pr-3 font-medium">Por quê</th>
                  <th className="py-1.5 text-right font-medium">Mensalidade</th>
                </tr>
              </thead>
              <tbody>
                {linhasVisiveis.map((l) => (
                  <tr key={l.chave} className="border-t border-border text-foreground">
                    <td className="py-1.5 pr-3 text-muted-foreground">{ROTULO_FONTE[l.fonte]}</td>
                    <td className="py-1.5 pr-3">{l.titulo}</td>
                    <td className="py-1.5 pr-3"><span className={`rounded border px-1.5 py-0.5 ${COR_ACAO[l.acao]}`}>{l.acao}</span></td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{l.motivo}</td>
                    <td className="py-1.5 text-right">{typeof l.campos.valorOrcamento === "number" ? brl(l.campos.valorOrcamento) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
