"use client";

// components/saude/FichaRelacionamento.tsx — a ficha de relacionamento do cliente (o que a Jornada CS
// editava): etapa da jornada, reuniões, o que o CLIENTE deve, notas e check-ins. Só a gestão vê:
// client_journey.notas traz a nota de handoff do comercial. A próxima ação mora no ProximaAcaoEditor.
//
// Grava em /api/cs/jornada (a mesma rota de antes; manda só os campos desta ficha).

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { chamar } from "@/lib/api/chamar";
import { ESTADO_GRAVADO, ETAPAS_JORNADA, ROTULO_ETAPA } from "@/lib/saude/carteira";
import type { Relacionamento } from "@/lib/saude/tipos";

interface Checkin { pergunta: string; resposta: string | null; status: string; origem: string; enviado_em: string }

const rotulo = "block text-lone-caption text-muted-foreground mb-1";

export default function FichaRelacionamento({
  clientId, nome, relacionamento: rel, onSalvo,
}: {
  clientId: string;
  nome: string;
  relacionamento: Relacionamento;
  onSalvo?: (r: Relacionamento) => void;
}) {
  const [estado, setEstado] = useState(rel.estadoManual ?? "");
  const [ultima, setUltima] = useState(rel.ultimaReuniao ?? "");
  const [proxima, setProxima] = useState(rel.proximaReuniao ?? "");
  const [pendencias, setPendencias] = useState(rel.pendenciasCliente.map((p) => p.item).join("\n"));
  const [notas, setNotas] = useState(rel.notas ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const [checkins, setCheckins] = useState<Checkin[] | null>(null);
  const [erroCheckin, setErroCheckin] = useState("");
  const [resposta, setResposta] = useState("");

  const carregarCheckins = async () => {
    const r = await chamar<{ checkins?: Checkin[] }>(`/api/cs/jornada?checkinsFor=${clientId}`);
    if (!r.ok) { setErroCheckin(r.erro ?? "Não consegui carregar os check-ins."); return; }
    setErroCheckin("");
    setCheckins(r.data?.checkins ?? []);
  };
  useEffect(() => { void carregarCheckins(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async () => {
    setSalvando(true); setErro("");
    const pendenciasCliente = pendencias.split("\n").map((s) => s.trim()).filter(Boolean).map((item) => {
      // Mantém "desde" e "impacto" de quem já estava na lista.
      const antes = rel.pendenciasCliente.find((p) => p.item.trim().toLowerCase() === item.toLowerCase());
      return antes ?? { item };
    });
    const r = await chamar("/api/cs/jornada", {
      clientId, estado: estado || null, ultimaReuniao: ultima || null, proximaReuniao: proxima || null,
      pendenciasCliente, notas,
    });
    setSalvando(false);
    // Fechar sem ter salvado era o pior desfecho da Jornada antiga: a pessoa reescrevia tudo depois.
    if (!r.ok) { setErro(r.erro ?? "Não consegui salvar a ficha."); return; }
    toast.success("Ficha de relacionamento salva.");
    onSalvo?.({ estadoManual: estado || null, ultimaReuniao: ultima || null, proximaReuniao: proxima || null, pendenciasCliente, notas: notas || null });
  };

  const registrar = async () => {
    if (!resposta.trim()) return;
    const r = await chamar<{ ok?: boolean }>("/api/cs/jornada", { clientId, checkinResposta: resposta });
    // A rota responde 200 com ok:false quando não gravou — as duas coisas são falha.
    if (!r.ok || r.data?.ok === false) { setErroCheckin(r.erro ?? "Não consegui registrar o check-in."); return; }
    setResposta("");
    void carregarCheckins();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={rotulo} htmlFor={`fr-estado-${clientId}`}>Etapa da jornada</label>
          <select id={`fr-estado-${clientId}`} value={estado} onChange={(e) => setEstado(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
            <option value="">Automática (pela saúde)</option>
            {ETAPAS_JORNADA.map((e) => <option key={e} value={ESTADO_GRAVADO[e]}>{ROTULO_ETAPA[e]}</option>)}
          </select>
        </div>
        <div>
          <label className={rotulo} htmlFor={`fr-ultima-${clientId}`}>Última reunião</label>
          <Input id={`fr-ultima-${clientId}`} type="date" value={ultima} onChange={(e) => setUltima(e.target.value)} />
        </div>
        <div>
          <label className={rotulo} htmlFor={`fr-proxima-${clientId}`}>Próxima reunião</label>
          <Input id={`fr-proxima-${clientId}`} type="date" value={proxima} onChange={(e) => setProxima(e.target.value)} />
        </div>
      </div>
      <div>
        <label className={rotulo} htmlFor={`fr-pend-${clientId}`}>O que o cliente nos deve (uma por linha)</label>
        <Textarea id={`fr-pend-${clientId}`} rows={2} value={pendencias} onChange={(e) => setPendencias(e.target.value)}
          placeholder="Ex.: senha do Instagram · logo em alta · aprovar a arte da promoção" />
      </div>
      <div>
        <label className={rotulo} htmlFor={`fr-notas-${clientId}`}>Notas do relacionamento</label>
        <Textarea id={`fr-notas-${clientId}`} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
      <div className="flex items-center justify-end gap-3">
        {erro && <span className="text-lone-caption text-lone-danger">{erro}</span>}
        <button type="button" onClick={() => void salvar()} disabled={salvando}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          {salvando && <Loader2 size={13} className="animate-spin" aria-hidden />} Salvar ficha
        </button>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-lone-eyebrow uppercase text-muted-foreground">Check-ins — o que o cliente contou</p>
        {checkins === null && !erroCheckin ? (
          <p className="text-lone-caption text-muted-foreground">Carregando…</p>
        ) : checkins && checkins.length === 0 ? (
          <p className="text-lone-caption text-muted-foreground">
            Nenhum check-in ainda. No WhatsApp: &quot;Lone, faz o check-in do {nome}&quot; (pro time) ou &quot;…pro cliente&quot;.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {(checkins ?? []).map((ck, i) => (
              <li key={i} className="rounded-md bg-muted/50 p-2 text-lone-caption">
                <p className="text-muted-foreground">{ck.pergunta} <span className="text-muted-foreground/70">· {ck.origem}</span></p>
                {ck.resposta
                  ? <p className="mt-0.5 text-foreground">{ck.resposta}</p>
                  : <p className="mt-0.5 text-lone-warning">Aguardando resposta</p>}
              </li>
            ))}
          </ul>
        )}
        {erroCheckin && <p className="text-lone-caption text-lone-danger">{erroCheckin}</p>}
        <div className="flex gap-2">
          <Input value={resposta} onChange={(e) => setResposta(e.target.value)} aria-label="Registrar o que o cliente falou"
            placeholder="Registrar o que o cliente falou (leads, atendimento, objeções, prioridades)" />
          <button type="button" onClick={() => void registrar()}
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted">
            Registrar
          </button>
        </div>
      </div>
    </div>
  );
}
