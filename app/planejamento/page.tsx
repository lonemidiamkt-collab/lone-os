"use client";

// /planejamento — onde a semana de conteúdo é decidida, do insumo ao calendário.
//
// Roberto (02/09): "radar e planejamento já são áreas do social media, por que estão separados? O
// radar já faz parte de um planejamento". Eram duas abas para um trabalho só. Agora a página segue
// a ordem real do trabalho: primeiro o que o mercado está mostrando (Radar), depois o calendário
// estratégico do cliente. Quem monta pauta olha referência antes de escolher tema — a tela agora
// respeita isso em vez de obrigar a trocar de aba no meio.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
import { useClientsStore } from "@/stores/useClientsStore";
import CalendarioEstrategico from "@/components/client-tabs/CalendarioEstrategico";
import RadarOportunidades from "@/components/planejamento/RadarOportunidades";
import MixDeConteudo from "@/components/planejamento/MixDeConteudo";
import { Button } from "@/components/ui/button";

interface Recente { jobId: string; clientId: string; cliente: string; periodo: string; modo: string; nPecas: number; createdAt: string }

export default function PlanejamentoPage() {
  const clients = useClientsStore((s) => s.clients);
  const initClients = useClientsStore((s) => s.init);
  const [clientId, setClientId] = useState("");
  const [recentes, setRecentes] = useState<Recente[] | null>(null); // null = carregando
  const [erroRecentes, setErroRecentes] = useState<string | null>(null);
  const [baixando, setBaixando] = useState("");

  useEffect(() => { initClients(); }, [initClients]);
  // ?cliente=<id> abre já no cliente (vem do "Mover para Ativo e planejar" do fim do onboarding).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("cliente");
    if (id) setClientId(id);
  }, []);
  const carregarRecentes = () => {
    setErroRecentes(null);
    chamar<{ items?: Recente[] }>("/api/cs/calendario/recentes").then((r) => {
      if (!r.ok) { setErroRecentes(r.erro); return; }
      setRecentes(r.data?.items ?? []);
    });
  };
  useEffect(() => { carregarRecentes(); }, []);

  const ativos = useMemo(
    () => [...clients].sort((a, b) => (a.nomeFantasia || a.name).localeCompare(b.nomeFantasia || b.name)),
    [clients],
  );

  // Baixa o PDF de um calendário recente: pega o resultado do job e renderiza.
  const baixar = async (jobId: string, cliente: string) => {
    setBaixando(jobId);
    try {
      type Job = { result?: { cliente?: string; periodo?: string; modo?: string; pecas?: unknown[] } };
      const jr = await chamar<Job>(`/api/cs/calendario?jobId=${jobId}`);
      if (!jr.ok) { toast.error(`Não consegui abrir o calendário: ${jr.erro}`); return; }
      const res = jr.data?.result;
      if (!res?.pecas?.length) { toast.error("Este calendário não tem peças para gerar o PDF."); return; }
      // PDF é binário: chamar() só lê JSON, então aqui fica o fetch cru, com cada falha dita.
      const pdf = await authedFetch(`/api/cs/calendario/pdf`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente: res.cliente, periodo: res.periodo, modo: res.modo, pecas: res.pecas }),
      });
      if (!pdf.ok) { toast.error(`Não consegui gerar o PDF (erro ${pdf.status}).`); return; }
      const blob = await pdf.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `calendario-${cliente || "cliente"}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Sem conexão para baixar o PDF. Tenta de novo?");
    } finally { setBaixando(""); }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Planejamento de conteúdo</h1>
        <p className="text-sm text-muted-foreground">O que o mercado está mostrando e o calendário estratégico de cada cliente — no mesmo lugar.</p>
      </div>

      {/* O insumo vem antes da decisão: some sozinho quando não há oportunidade nova. */}
      <RadarOportunidades />

      <div className="space-y-1">
        <label className="text-sm font-medium">Cliente</label>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Escolha um cliente…</option>
          {ativos.map((c) => <option key={c.id} value={c.id}>{c.nomeFantasia || c.name}</option>)}
        </select>
      </div>

      {/* O que esse feed já tem (e o que o plano promete) antes de decidir o calendário (N15). */}
      {clientId && <MixDeConteudo clientId={clientId} />}

      {clientId && <CalendarioEstrategico clientId={clientId} />}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Calendários recentes</h2>
          <button onClick={carregarRecentes} className="text-xs text-muted-foreground hover:text-primary">atualizar</button>
        </div>
        {erroRecentes ? (
          <p className="text-sm text-destructive">Não consegui carregar os calendários recentes: {erroRecentes}</p>
        ) : recentes === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : recentes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum calendário gerado ainda.</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {recentes.map((r) => (
              <div key={r.jobId} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.cliente || "—"}</p>
                  <p className="text-xs text-muted-foreground">{r.periodo} · {r.nPecas} peça(s) · {new Date(r.createdAt).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setClientId(r.clientId)}>Abrir</Button>
                  <Button variant="outline" size="sm" disabled={baixando === r.jobId} onClick={() => baixar(r.jobId, r.cliente)}>{baixando === r.jobId ? "…" : "Baixar PDF"}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
