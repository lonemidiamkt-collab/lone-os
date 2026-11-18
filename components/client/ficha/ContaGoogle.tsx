"use client";

// components/client/ficha/ContaGoogle.tsx — o Google do cliente na ficha (Admin): conta do Google Ads e Perfil da
// Empresa (Google Meu Negócio). É daqui que saem os números do Google no relatório semanal, no mensal e na aba Google
// do portal (lib/google/). A rota é /api/clients/[id]/google.
//
// Mesmas regras do vínculo da Meta (ContaMetaAds): a lista diz de quem já é cada conta/perfil e conta de outro cliente
// pede confirmação ("transferir para cá") — o servidor recusa sem ela. Falha do Google aparece como erro com o motivo
// e "Tentar de novo"; nunca como lista vazia.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Link2, Loader2, MapPin, Megaphone, RefreshCw, Unlink } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { formatarIdAds } from "@/lib/google/ids";

interface Estado {
  ads: { id: string; nome: string | null; loginId: string | null } | null;
  perfil: { local: string; nome: string | null } | null;
  sincronia: {
    ads_sincronizado_em: string | null; ads_erro: string | null;
    perfil_sincronizado_em: string | null; perfil_erro: string | null; perfil_ultimo_dia: string | null;
  } | null;
  conexao: { conectado: boolean; ads: boolean; perfil: boolean; email: string | null };
  sugestoes: { tipo: "ads" | "perfil"; chave: string; nome: string | null; login_id: string | null; motivo: string | null }[];
  podeAlterar: boolean;
}
interface ContaAds { id: string; nome: string; moeda: string | null; loginId: string | null; outros: string[] }
interface Perfil { local: string; nome: string; endereco: string | null; outros: string[] }

const quando = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : null;
const dataBR = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : null);

function Situacao({ em, erro, extra }: { em: string | null | undefined; erro: string | null | undefined; extra?: string | null }) {
  if (erro && !erro.startsWith("Parcial")) return <p className="flex items-start gap-1.5 text-lone-caption text-lone-danger"><AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />{erro}</p>;
  if (!em) return <p className="text-lone-caption text-muted-foreground">Ainda não lido. A rotina lê todo dia às 7h — ou clique em Atualizar agora.</p>;
  return (
    <p className="text-lone-caption text-muted-foreground">
      Lido em {quando(em)}{extra ? ` · ${extra}` : ""}
      {erro ? <span className="block text-lone-warning">{erro}</span> : null}
    </p>
  );
}

export default function ContaGoogle({ clientId }: { clientId: string }) {
  const [e, setE] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lista, setLista] = useState<null | { tipo: "ads"; itens: ContaAds[] } | { tipo: "perfil"; itens: Perfil[] }>(null);
  const [listando, setListando] = useState<"ads" | "perfil" | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState<{ texto: string; corpo: Record<string, unknown> } | null>(null);

  const carregar = useCallback(async () => {
    const r = await chamar<Estado>(`/api/clients/${clientId}/google`);
    if (r.ok && r.data) { setE(r.data); setErro(null); } else setErro(r.erro ?? "Não consegui ler o Google deste cliente.");
  }, [clientId]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function listar(tipo: "ads" | "perfil") {
    setListando(tipo); setErroLista(null); setLista(null); setBusca(""); setConfirmar(null);
    const r = await chamar<{ contas?: ContaAds[]; perfis?: Perfil[] }>(`/api/clients/${clientId}/google`, { acao: tipo === "ads" ? "listar_ads" : "listar_perfis" });
    setListando(null);
    if (!r.ok || !r.data) { setErroLista(r.erro ?? "Não consegui listar."); return; }
    setLista(tipo === "ads" ? { tipo, itens: r.data.contas ?? [] } : { tipo, itens: r.data.perfis ?? [] });
  }

  async function enviar(corpo: Record<string, unknown>, okMsg: string) {
    setOcupado(true);
    const r = await chamar<{ leitura?: { ok: boolean; erro?: string } | null }>(`/api/clients/${clientId}/google`, corpo);
    setOcupado(false);
    if (!r.ok) {
      if (r.status === 409 && !corpo.transferir) { setConfirmar({ texto: r.erro ?? "Já está em outro cliente.", corpo: { ...corpo, transferir: true } }); return; }
      toast.error(r.erro ?? "Não consegui."); void carregar(); return;
    }
    setLista(null); setConfirmar(null);
    if (r.data?.leitura && !r.data.leitura.ok) toast.warning(`${okMsg} Mas a primeira leitura falhou: ${r.data.leitura.erro}`);
    else toast.success(okMsg);
    void carregar();
  }

  async function desvincular(tipo: "ads" | "perfil") {
    if (!window.confirm(tipo === "ads" ? "Desvincular a conta do Google Ads? Os próximos relatórios saem sem os anúncios do Google." : "Desvincular o Perfil da Empresa? Os próximos relatórios saem sem ligações, rotas e visitas ao site do perfil.")) return;
    await enviar({ acao: tipo === "ads" ? "desvincular_ads" : "desvincular_perfil" }, "Desvinculado.");
  }

  async function procurar() {
    setOcupado(true);
    const r = await chamar<{ vinculadosAqui: { tipo: string; nome: string }[] }>(`/api/clients/${clientId}/google`, { acao: "procurar" });
    setOcupado(false);
    if (!r.ok && !r.data?.vinculadosAqui?.length) toast.error(r.erro ?? "Não consegui procurar.");
    else if (r.data?.vinculadosAqui?.length) toast.success(`Achei e vinculei: ${r.data.vinculadosAqui.map((v) => v.nome).join(", ")}.`);
    else toast.message("Nada novo com certeza para este cliente. Se aparecer sugestão, confirme abaixo.");
    void carregar();
  }

  async function atualizar() {
    setOcupado(true);
    const r = await chamar(`/api/clients/${clientId}/google`, { acao: "sincronizar" });
    setOcupado(false);
    if (!r.ok) toast.error(`A leitura falhou: ${r.erro}`); else toast.success("Números do Google atualizados.");
    void carregar();
  }

  if (erro) return <p className="text-lone-caption text-lone-danger">{erro} <button onClick={() => void carregar()} className="underline">Tentar de novo</button></p>;
  if (!e) return <p className="flex items-center gap-1.5 text-lone-caption text-muted-foreground"><Loader2 size={13} className="animate-spin" aria-hidden /> Lendo o Google…</p>;

  const s = e.sincronia;
  const filtrados = lista
    ? (lista.itens as (ContaAds | Perfil)[]).filter((x) => !busca || x.nome.toLowerCase().includes(busca.toLowerCase()) || ("id" in x && x.id.includes(busca.replace(/-/g, ""))))
    : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lone-body text-muted-foreground">Google (Ads e Perfil da Empresa)</p>
        {(e.ads || e.perfil) && e.podeAlterar && (
          <button disabled={ocupado} onClick={() => void atualizar()} className="inline-flex items-center gap-1 text-lone-caption text-muted-foreground hover:text-foreground disabled:opacity-50">
            <RefreshCw size={12} className={ocupado ? "animate-spin" : ""} aria-hidden /> Atualizar agora
          </button>
        )}
      </div>

      {e.conexao.conectado && e.podeAlterar && (!e.ads || !e.perfil) && (
        <p className="text-lone-caption text-muted-foreground">
          A Lone procura sozinha, todo dia às 7h, a conta de anúncio e o perfil deste cliente entre os que ela gerencia (nome igual, ou telefone igual no perfil).
          Acabou de receber o acesso? <button disabled={ocupado} onClick={() => void procurar()} className="font-medium text-primary hover:underline disabled:opacity-50">Procurar agora</button>
        </p>
      )}

      {e.podeAlterar && e.sugestoes.map((sg) => (
        <div key={`${sg.tipo}-${sg.chave}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
          <span className="text-lone-caption text-foreground">
            Parece ser deste cliente ({sg.motivo ?? "nome parecido"}): <b>{sg.nome ?? sg.chave}</b> — {sg.tipo === "ads" ? `Google Ads ${formatarIdAds(sg.chave)}` : "Perfil da Empresa"}
          </span>
          <button disabled={ocupado} onClick={() => void enviar(sg.tipo === "ads"
            ? { acao: "vincular_ads", id: sg.chave, nome: sg.nome, loginId: sg.login_id }
            : { acao: "vincular_perfil", local: sg.chave, nome: sg.nome }, "Vinculado.")}
            className="h-7 rounded-lg bg-primary px-3 text-lone-caption font-medium text-primary-foreground disabled:opacity-50">É este — vincular</button>
        </div>
      ))}

      {!e.conexao.conectado && (
        <p className="rounded-lg border border-lone-warning-border bg-lone-warning-bg p-2.5 text-lone-caption text-lone-warning">
          O Google Ads e o Perfil da Empresa não estão conectados no Lone OS. Um sócio conecta em Sistema › Integrações.
        </p>
      )}

      {/* Google Ads */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-lone-body text-foreground"><Megaphone size={14} aria-hidden /> Google Ads</span>
          {e.podeAlterar && e.conexao.conectado && (
            <span className="flex items-center gap-3">
              <button disabled={!!listando || ocupado} onClick={() => void listar("ads")} className="inline-flex items-center gap-1 text-lone-caption font-medium text-primary hover:underline disabled:opacity-50">
                {listando === "ads" ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Link2 size={12} aria-hidden />} {e.ads ? "Trocar" : "Vincular conta"}
              </button>
              {e.ads && <button disabled={ocupado} onClick={() => void desvincular("ads")} className="inline-flex items-center gap-1 text-lone-caption text-muted-foreground hover:text-lone-danger"><Unlink size={12} aria-hidden /> Desvincular</button>}
            </span>
          )}
        </div>
        {e.ads ? (
          <div className="mt-1.5 space-y-0.5">
            <p className="text-lone-body font-medium text-foreground">{e.ads.nome || "Conta do Google Ads"} <span className="font-normal text-muted-foreground">· {formatarIdAds(e.ads.id)}{e.ads.loginId ? ` · via MCC ${formatarIdAds(e.ads.loginId)}` : ""}</span></p>
            <Situacao em={s?.ads_sincronizado_em} erro={s?.ads_erro} />
          </div>
        ) : <p className="mt-1 text-lone-caption text-muted-foreground">Sem conta vinculada. Só entra no relatório com contrato de tráfego.</p>}
      </div>

      {/* Perfil da Empresa */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-lone-body text-foreground"><MapPin size={14} aria-hidden /> Perfil da Empresa (Google Meu Negócio)</span>
          {e.podeAlterar && e.conexao.conectado && (
            <span className="flex items-center gap-3">
              <button disabled={!!listando || ocupado} onClick={() => void listar("perfil")} className="inline-flex items-center gap-1 text-lone-caption font-medium text-primary hover:underline disabled:opacity-50">
                {listando === "perfil" ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Link2 size={12} aria-hidden />} {e.perfil ? "Trocar" : "Vincular perfil"}
              </button>
              {e.perfil && <button disabled={ocupado} onClick={() => void desvincular("perfil")} className="inline-flex items-center gap-1 text-lone-caption text-muted-foreground hover:text-lone-danger"><Unlink size={12} aria-hidden /> Desvincular</button>}
            </span>
          )}
        </div>
        {e.perfil ? (
          <div className="mt-1.5 space-y-0.5">
            <p className="text-lone-body font-medium text-foreground">{e.perfil.nome || e.perfil.local}</p>
            <Situacao em={s?.perfil_sincronizado_em} erro={s?.perfil_erro} extra={s?.perfil_ultimo_dia ? `o Google já entregou até ${dataBR(s.perfil_ultimo_dia)}` : null} />
          </div>
        ) : <p className="mt-1 text-lone-caption text-muted-foreground">Sem perfil vinculado. O cliente precisa adicionar a conta Google da Lone como gerente do perfil.</p>}
      </div>

      {erroLista && (
        <p className="text-lone-caption text-lone-danger">{erroLista} <button onClick={() => setErroLista(null)} className="underline">Fechar</button></p>
      )}

      {confirmar && (
        <div className="space-y-2 rounded-lg border border-lone-warning-border bg-lone-warning-bg p-3">
          <p className="text-lone-caption text-lone-warning">{confirmar.texto}</p>
          <div className="flex gap-2">
            <button disabled={ocupado} onClick={() => void enviar(confirmar.corpo, "Transferido para este cliente.")} className="h-8 rounded-lg bg-primary px-3 text-lone-caption font-medium text-primary-foreground disabled:opacity-50">Transferir para cá</button>
            <button onClick={() => setConfirmar(null)} className="h-8 rounded-lg px-3 text-lone-caption text-muted-foreground hover:text-foreground">Cancelar</button>
          </div>
        </div>
      )}

      {lista && !confirmar && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <input value={busca} onChange={(ev) => setBusca(ev.target.value)} placeholder={lista.tipo === "ads" ? "Buscar por nome ou ID" : "Buscar por nome"}
              className="h-8 flex-1 rounded-lg border border-border bg-background px-2.5 text-lone-caption text-foreground focus:border-primary focus:outline-none" aria-label="Buscar" />
            <button onClick={() => setLista(null)} className="text-lone-caption text-muted-foreground hover:text-foreground">Fechar</button>
          </div>
          {!lista.itens.length ? (
            <p className="text-lone-caption text-muted-foreground">
              {lista.tipo === "ads"
                ? `A conta Google conectada${e.conexao.email ? ` (${e.conexao.email})` : ""} não enxerga nenhuma conta de anúncio ativa. Peça acesso à conta do cliente (ou ligue a conta ao MCC da Lone).`
                : `A conta Google conectada${e.conexao.email ? ` (${e.conexao.email})` : ""} não gerencia nenhum perfil. Peça ao cliente para adicioná-la como gerente do Perfil da Empresa.`}
            </p>
          ) : (
            <ul className="max-h-64 divide-y divide-border overflow-auto">
              {filtrados.map((x) => {
                const atual = lista.tipo === "ads" ? e.ads?.id === (x as ContaAds).id : e.perfil?.local === (x as Perfil).local;
                const corpo = lista.tipo === "ads"
                  ? { acao: "vincular_ads", id: (x as ContaAds).id, nome: x.nome, loginId: (x as ContaAds).loginId }
                  : { acao: "vincular_perfil", local: (x as Perfil).local, nome: x.nome };
                return (
                  <li key={"id" in x ? x.id : x.local}>
                    <button disabled={ocupado || atual} onClick={() => void enviar(corpo, lista.tipo === "ads" ? "Conta do Google Ads vinculada." : "Perfil da Empresa vinculado.")}
                      className="flex w-full items-start justify-between gap-3 py-2 text-left hover:bg-accent/40 disabled:opacity-60">
                      <span className="min-w-0">
                        <span className="block text-lone-body text-foreground">{x.nome}</span>
                        <span className="block text-lone-caption text-muted-foreground">
                          {lista.tipo === "ads"
                            ? `${formatarIdAds((x as ContaAds).id)}${(x as ContaAds).loginId ? ` · via MCC ${formatarIdAds((x as ContaAds).loginId)}` : ""}${(x as ContaAds).moeda ? ` · ${(x as ContaAds).moeda}` : ""}`
                            : (x as Perfil).endereco ?? ""}
                        </span>
                        {x.outros.length > 0 && <span className="block text-lone-caption text-lone-warning">Já está em: {x.outros.join(", ")}</span>}
                      </span>
                      {atual && <Check size={14} className="mt-1 shrink-0 text-lone-success" aria-label="Vinculada" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
