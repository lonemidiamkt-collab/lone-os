"use client";

// Âncora — o acesso de cada cliente ao Âncora CRM (lib/integracoes/ancora.ts). Pedido do Roberto (12/11/2026):
// "entrar no Lone OS, numa aba Âncora, e mandar só um link de cadastro para o cliente; os dados dele a gente já
// tem". Uma linha por cliente ativo, com o estado lido AGORA do Âncora e o botão de gerar o link.
//
// O sistema NÃO envia o link: mostra para copiar, e quem manda ao cliente é a pessoa. Gerar errado se desfaz
// aqui mesmo (Cancelar link) — docs/ERRO_RECUPERAVEL.md. Se o Âncora não responder, a tela diz isso; não
// mostra "sem acesso" para quem ela não conseguiu conferir.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy, Link2, RefreshCw, Search, X } from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/context/RoleContext";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { resumoDoEstado, type EstadoDoCliente } from "@/lib/integracoes/ancora";
import { GerarLinkAncora, TOM_ANCORA, assinaturaAncora, diaAncora } from "@/components/ancora/AcessoAncora";

interface Linha { id: string; nome: string; temEmail: boolean; estado: EstadoDoCliente | null }
interface Resposta { ancora: { ligada: boolean; erro: string | null; lidoEm: string | null }; clientes: Linha[] }

function LinhaDoCliente({ c, aberto, onAbrir, onFechar, onMudou }: {
  c: Linha; aberto: boolean; onAbrir: () => void; onFechar: () => void; onMudou: () => void;
}) {
  const e = c.estado;
  const r = resumoDoEstado(e);
  const [copiado, setCopiado] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const copiar = async () => {
    if (!e?.link) return;
    try {
      await navigator.clipboard.writeText(e.link);
      setCopiado(true); setTimeout(() => setCopiado(false), 2000);
    } catch { toast.error("Não consegui copiar. Selecione o link e copie à mão."); }
  };
  const cancelar = async () => {
    setCancelando(true);
    const res = await chamar("/api/ancora/link", { clientId: c.id }, { method: "DELETE" });
    setCancelando(false);
    if (!res.ok) { toast.error(res.erro ?? "Não consegui cancelar o link."); return; }
    toast.success("Link cancelado. Ele não abre mais.");
    onMudou();
  };

  const podeGerar = !e || e.estado === "sem_convite" || e.estado === "vencido";
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lone-body font-medium text-foreground">{c.nome}</p>
          <p className="text-lone-caption text-muted-foreground">
            {e?.estado === "cadastrou"
              ? [`Cadastrou em ${diaAncora(e.cadastrou_em)}`, assinaturaAncora(e), e.empresa?.acesso_da_agencia ? "autorizou nosso acesso" : "não autorizou nosso acesso"].filter(Boolean).join(" · ")
              : e?.estado === "link_gerado" ? `Gerado em ${diaAncora(e.gerado_em)} · plano ${e.plano ?? "—"}${e.parceria ? " · parceria" : ""}`
              : e?.estado === "vencido" ? `O link de ${diaAncora(e.gerado_em)} venceu sem cadastro`
              : !c.temEmail ? "Sem e-mail na ficha — complete o cadastro para gerar o link" : "Ainda não tem acesso ao Âncora"}
          </p>
        </div>
        <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-lone-caption font-medium", TOM_ANCORA[r.tom])}>{r.rotulo}</span>
        <div className="flex shrink-0 items-center gap-2">
          {e?.estado === "link_gerado" && (
            <>
              <Button size="sm" onClick={() => void copiar()}>{copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar link"}</Button>
              <Button size="sm" variant="ghost" onClick={() => void cancelar()} disabled={cancelando}><X /> {cancelando ? "Cancelando…" : "Cancelar link"}</Button>
            </>
          )}
          {podeGerar && !aberto && (
            c.temEmail
              ? <Button size="sm" variant="outline" onClick={onAbrir}><Link2 /> {e?.estado === "vencido" ? "Gerar novo link" : "Gerar link"}</Button>
              : <Link href={`/clients/${c.id}`} className="text-lone-caption font-medium text-primary hover:underline">Abrir ficha →</Link>
          )}
        </div>
      </div>
      {e?.estado === "link_gerado" && e.link && (
        <p className="mt-2 select-all break-all rounded-md bg-muted px-2 py-1.5 font-mono text-lone-caption text-muted-foreground">{e.link}</p>
      )}
      {aberto && podeGerar && <GerarLinkAncora clientId={c.id} onFechar={onFechar} onGerado={() => { onFechar(); onMudou(); }} />}
    </li>
  );
}

export default function AncoraPage() {
  const { role, hydrated } = useRole();
  const gestao = role === "admin" || role === "manager";
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await chamar<Resposta>("/api/ancora");
    setCarregando(false);
    if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui carregar a lista."); return; }
    setErro(null); setDados(r.data);
  }, []);
  useEffect(() => { if (gestao) void carregar(); }, [gestao, carregar]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (dados?.clientes ?? []).filter((c) => !t || c.nome.toLowerCase().includes(t));
  }, [dados, busca]);

  if (!hydrated) return null;
  if (!gestao) {
    return (
      <div className="flex-1 min-w-0 overflow-auto">
        <Header title="Âncora" />
        <div className="p-6"><p className="text-lone-body text-muted-foreground">Esta área é só da gestão.</p></div>
      </div>
    );
  }

  const a = dados?.ancora;
  const conferidos = !!a?.ligada && !a.erro;
  const comAcesso = (dados?.clientes ?? []).filter((c) => c.estado?.estado === "cadastrou").length;
  const comLink = (dados?.clientes ?? []).filter((c) => c.estado?.estado === "link_gerado").length;

  return (
    <div className="flex-1 min-w-0 overflow-auto">
      <Header title="Âncora" />
      <div className="mx-auto max-w-[1100px] space-y-5 p-4 animate-fade-in sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-lone-body text-muted-foreground">
            O acesso de cada cliente ao Âncora CRM. Gere o link de cadastro, copie e envie: o cadastro dele já vem
            preenchido com o que está na ficha, e ele só confere e cria a senha.
          </p>
          <div className="flex items-center gap-3">
            {dados && conferidos && (
              <span className="text-lone-caption text-muted-foreground">
                {comAcesso} com acesso · {comLink} com link aberto · lido às{" "}
                {a?.lidoEm ? new Date(a.lidoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—"}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
              <RefreshCw className={cn(carregando && "animate-spin")} /> Atualizar
            </Button>
          </div>
        </div>

        {erro && (
          <p className="rounded-lg border border-lone-danger-border bg-lone-danger-bg p-3 text-lone-body text-lone-danger">
            {erro} <button onClick={() => void carregar()} className="underline">Tentar de novo</button>
          </p>
        )}
        {a && !a.ligada && (
          <p className="rounded-lg border border-border bg-muted p-3 text-lone-body text-foreground">
            A integração com o Âncora está desligada neste servidor: falta configurar o segredo compartilhado
            (<span className="font-mono">ANCORA_PARCEIRO_SECRET</span>). Sem ele não dá para gerar link nem ler o estado.
          </p>
        )}
        {a?.ligada && a.erro && (
          <p className="rounded-lg border border-lone-warning-border bg-lone-warning-bg p-3 text-lone-body text-lone-warning">
            Não consegui perguntar ao Âncora agora ({a.erro}) A lista abaixo está sem o estado — isso não quer dizer
            que os clientes estão sem acesso. <button onClick={() => void carregar()} className="underline">Tentar de novo</button>
          </p>
        )}
        {!dados && !erro && <p className="text-lone-body text-muted-foreground">Lendo os clientes e o estado no Âncora…</p>}

        {dados && (
          <>
            <label className="relative block max-w-sm">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…" aria-label="Buscar cliente"
                className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-lone-body text-foreground placeholder:text-muted-foreground" />
            </label>
            {lista.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-lone-body text-muted-foreground">
                {dados.clientes.length === 0 ? "Nenhum cliente ativo na carteira." : "Nenhum cliente com esse nome."}
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {lista.map((c) => (
                  conferidos
                    ? <LinhaDoCliente key={c.id} c={c} aberto={aberto === c.id}
                        onAbrir={() => setAberto(c.id)} onFechar={() => setAberto(null)} onMudou={() => void carregar()} />
                    : <li key={c.id} className="px-4 py-3 sm:px-5">
                        <p className="truncate text-lone-body font-medium text-foreground">{c.nome}</p>
                        <p className="text-lone-caption text-muted-foreground">Estado não conferido</p>
                      </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
