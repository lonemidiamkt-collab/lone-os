"use client";

// components/client/ficha/LoneAcademy.tsx — liberar a Lone Academy para o cliente e ver como está.
//
// 04/11/2026. A Academy é a plataforma de treinamento do time do cliente (academy.lonemidia.com).
// A gestão decide por cliente: aqui libera, a Academy cria a empresa e manda o e-mail de acesso ao
// dono, que cria a própria senha (sem senha padrão). Tudo passa por /api/clients/[id]/academy.
//
// O que sai para o cliente é irreversível (docs/ERRO_RECUPERAVEL.md, ponto 7): antes de mandar, a
// tela mostra para quem vai e pede confirmação. Se o e-mail não sair, diz por quê e mostra o link
// para mandar pelo WhatsApp — nunca "✅ enviado" sem ter ido.

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, GraduationCap, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import type { RespostaAcademy, StatusAcademy } from "@/lib/academy/cliente";
import type { Client } from "@/lib/types";

type Status = StatusAcademy & { sugestao?: { gestorNome: string; gestorEmail: string }; clienteEncerrado?: boolean };

const SITUACAO: Record<string, string> = { active: "Ativa", paused: "Pausada na Academy", closed: "Encerrada" };
const ASSENTOS_PADRAO = 10;

const quando = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const haQuanto = (iso?: string | null) => {
  if (!iso) return "ninguém entrou ainda";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`;
};

export default function LoneAcademy({ client: c }: { client: Client }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<{ acao: "liberar" | "reenviar"; nome: string; email: string; assentos: string } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [planoB, setPlanoB] = useState<{ link: string; motivo: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErroCarga(null);
    const r = await chamar<Status>(`/api/clients/${c.id}/academy`);
    setCarregando(false);
    if (!r.ok || !r.data) { setErroCarga(r.erro ?? "Não consegui ver a Lone Academy deste cliente."); return; }
    setStatus(r.data);
  }, [c.id]);
  useEffect(() => { void carregar(); }, [carregar]);

  const abrir = (acao: "liberar" | "reenviar") => {
    setErroEnvio(null); setConfirmando(false); setPlanoB(null);
    setForm({
      acao,
      nome: status?.sugestao?.gestorNome || c.contactName || "",
      email: (acao === "reenviar" && status?.gestor?.email) || status?.sugestao?.gestorEmail || "",
      assentos: String(ASSENTOS_PADRAO),
    });
  };

  const validar = (): string | null => {
    if (!form) return "Preencha os dados.";
    if (form.nome.trim().length < 2) return "Escreva o nome de quem vai cuidar do time na Academy.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return "E-mail inválido. Confira se está completo, ex.: nome@loja.com.br.";
    const n = Number(form.assentos);
    if (form.acao === "liberar" && (!Number.isInteger(n) || n < 1 || n > 5000)) return "Assentos: um número inteiro de 1 a 5000.";
    return null;
  };

  const enviar = async () => {
    if (!form || enviando) return;
    setEnviando(true); setErroEnvio(null);
    const r = await chamar<RespostaAcademy>(`/api/clients/${c.id}/academy`, {
      acao: form.acao, gestorNome: form.nome.trim(), gestorEmail: form.email.trim().toLowerCase(),
      ...(form.acao === "liberar" ? { assentos: Number(form.assentos) } : {}),
    });
    setEnviando(false);
    if (!r.ok || !r.data) { setErroEnvio(r.erro ?? "Não consegui falar com a Lone Academy."); setConfirmando(false); return; }
    const d = r.data;
    setStatus((s) => ({ ...s, ...d }));
    setForm(null); setConfirmando(false);
    if (d.resultado === "dono_ja_tem_acesso") { toast.success("Este e-mail já tem acesso à Lone Academy. Nada foi enviado."); return; }
    if (d.resultado === "convite_ja_enviado") { toast.message("O convite já tinha ido para este e-mail. Use “Reenviar” se ele não achou."); return; }
    if (d.email?.enviado) toast.success(`E-mail de acesso enviado para ${form.email.trim()}.`);
    else if (d.link) setPlanoB({ link: d.link, motivo: d.email && !d.email.enviado ? d.email.motivo : "o e-mail não saiu" });
  };

  const copiar = (t: string) => navigator.clipboard.writeText(t).then(
    () => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); },
    () => toast.error("Não consegui copiar. Selecione o link e copie à mão."));

  const campo = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring";
  const botao = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50";
  const primario = "inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50";

  if (carregando && !status) return <p className="text-lone-body text-muted-foreground">Consultando a Lone Academy…</p>;
  if (erroCarga) {
    return (
      <div role="alert" className="space-y-2 rounded-lg border border-lone-danger-border bg-lone-danger-bg p-3">
        <p className="text-sm text-lone-danger">{erroCarga}</p>
        <button onClick={() => void carregar()} className={botao}><RefreshCw size={14} aria-hidden="true" /> Tentar de novo</button>
      </div>
    );
  }

  const g = status?.gestor;
  const convite = g?.convite ?? "nenhum";
  const liberada = !!status?.existe;

  return (
    <div className="space-y-4">
      {!liberada ? (
        <p className="text-lone-body text-muted-foreground">
          Ainda não liberada. Ao liberar, a Academy cria a empresa com os cursos da Lone e manda ao dono um e-mail para ele criar a
          senha e convidar o time. O link vale 7 dias.
        </p>
      ) : (
        <dl className="divide-y divide-border">
          {[
            ["Situação", SITUACAO[status?.situacao ?? ""] ?? "—"],
            ["Acesso do dono", !g?.email ? "—"
              : convite === "aceito" ? `${g.email} · entrou em ${quando(g.aceitoEm)}`
              : convite === "pendente" ? `${g.email} · e-mail enviado em ${quando(g.enviadoEm)}, vale até ${quando(g.expiraEm)}`
              : convite === "vencido" ? `${g.email} · o link venceu sem ser usado`
              : g.email],
            ["Assentos", status?.assentos ? `${status.assentos.emUso} em uso de ${status.assentos.limite}` : "—"],
            ["Estudaram nos últimos 7 dias", String(status?.ativos7d ?? 0)],
            ["Último acesso do time", haQuanto(status?.ultimoAcesso)],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5">
              <dt className="text-lone-body text-muted-foreground">{k}</dt>
              <dd className="text-right text-lone-body text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {status?.clienteEncerrado ? (
        <p className="text-lone-caption text-muted-foreground">Parceria encerrada: o acesso do time na Academy fica fechado. Reative o cliente para liberar de novo.</p>
      ) : !form && (
        <div className="flex flex-wrap gap-2">
          {!liberada && <button onClick={() => abrir("liberar")} className={primario}><GraduationCap size={15} aria-hidden="true" /> Liberar Lone Academy</button>}
          {liberada && convite !== "aceito" && <button onClick={() => abrir("reenviar")} className={botao}><Mail size={15} aria-hidden="true" /> {convite === "nenhum" ? "Enviar acesso ao dono" : "Reenviar e-mail de acesso"}</button>}
          {liberada && <button onClick={() => void carregar()} disabled={carregando} className={botao}><RefreshCw size={14} aria-hidden="true" /> Atualizar</button>}
        </div>
      )}

      {form && !confirmando && (
        <div className="max-w-md space-y-3 rounded-xl border border-border bg-background p-4">
          <label className="block space-y-1">
            <span className="text-lone-caption text-muted-foreground">Quem cuida do time na Academy (o dono ou gerente)</span>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={campo} maxLength={80} placeholder="ex.: Paula Souza" />
          </label>
          <label className="block space-y-1">
            <span className="text-lone-caption text-muted-foreground">E-mail dele (vira o login e recebe o link)</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={campo} maxLength={200} placeholder="nome@loja.com.br" />
          </label>
          {form.acao === "liberar" && (
            <label className="block space-y-1">
              <span className="text-lone-caption text-muted-foreground">Assentos (pessoas ativas ao mesmo tempo, contando o dono)</span>
              <input type="number" min={1} max={5000} value={form.assentos} onChange={(e) => setForm({ ...form, assentos: e.target.value })} className={campo} />
            </label>
          )}
          {erroEnvio && <p role="alert" className="text-sm text-lone-danger">{erroEnvio}</p>}
          <div className="flex gap-2">
            <button onClick={() => { const e = validar(); if (e) { setErroEnvio(e); return; } setErroEnvio(null); setConfirmando(true); }} className={primario}>Continuar</button>
            <button onClick={() => setForm(null)} className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
          </div>
        </div>
      )}

      {form && confirmando && (
        <div className="max-w-md space-y-3 rounded-xl border border-primary/30 bg-background p-4">
          <p className="text-sm font-medium text-foreground">Confira antes de mandar</p>
          <ul className="space-y-1 text-lone-body text-muted-foreground">
            {form.acao === "liberar" && <li>Cria <strong className="text-foreground">{c.nomeFantasia || c.name}</strong> na Lone Academy com <strong className="text-foreground">{form.assentos} assentos</strong> e os cursos da Lone.</li>}
            <li>Manda o e-mail “Seu acesso à Lone Academy” para <strong className="text-foreground">{form.email.trim().toLowerCase()}</strong> ({form.nome.trim()}).</li>
            {form.acao === "reenviar" && <li>O link anterior para de valer.</li>}
          </ul>
          <div className="flex gap-2">
            <button onClick={() => void enviar()} disabled={enviando} className={primario}>{enviando ? "Enviando…" : form.acao === "liberar" ? "Liberar e enviar e-mail" : "Reenviar e-mail"}</button>
            <button onClick={() => setConfirmando(false)} disabled={enviando} className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">Voltar e corrigir</button>
          </div>
        </div>
      )}

      {planoB && (
        <div role="alert" className="max-w-xl space-y-2 rounded-xl border border-lone-warning-border bg-lone-warning-bg p-4">
          <p className="text-sm text-lone-warning">Liberado, mas o e-mail não saiu: {planoB.motivo}. Mande este link para o dono pelo WhatsApp (vale 7 dias, uso único):</p>
          <p className="break-all rounded-lg bg-background p-2 font-mono text-xs text-foreground">{planoB.link}</p>
          <button onClick={() => copiar(planoB.link)} className={botao}>{copiado ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copiado ? "Copiado" : "Copiar link"}</button>
        </div>
      )}
    </div>
  );
}
