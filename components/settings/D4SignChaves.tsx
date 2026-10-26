"use client";

// components/settings/D4SignChaves.tsx — as chaves da D4Sign coladas no painel (Configurações › Jurídico).
// A tela NUNCA recebe uma chave de volta: só se está configurada, de onde vem (painel ou servidor), quando e por
// quem. Trocar é colar de novo. Regras e cifra em lib/contracts/d4sign-config.ts.

import { useEffect, useState } from "react";
import { CheckCircle, FileSignature, Loader2, RefreshCw, Save, XCircle } from "lucide-react";
import { chamar } from "@/lib/api/chamar";

type Campo = "token" | "cryptKey" | "hmac" | "cofre" | "emailsLone";
interface Situacao {
  campos: Record<Campo, { configurado: boolean; origem: "painel" | "servidor" | null }>;
  cofre: string | null;
  emailsLone: string[];
  atualizadoEm: string | null;
  atualizadoPor: string | null;
  testadoEm: string | null;
  testeOk: boolean | null;
  testeResultado: string | null;
  historico: { quem: string; quando: string; acao: "trocou" | "apagou" | "testou"; campos: string[]; resultado?: string }[];
  ligada: boolean;
}

const CAMPOS: { campo: Campo; rotulo: string; onde: string; segredo: boolean }[] = [
  { campo: "token", rotulo: "Token da API (tokenAPI)", onde: "D4Sign › Opções da conta › Dev (API)", segredo: true },
  { campo: "cryptKey", rotulo: "Chave de criptografia (cryptKey)", onde: "mesma tela, logo abaixo do token", segredo: true },
  { campo: "hmac", rotulo: "Segredo do webhook (Secret Key MAC)", onde: "mesma tela › \"Gerar Secret Key MAC\"", segredo: true },
  { campo: "cofre", rotulo: "Identificador do cofre dos contratos", onde: "abra o cofre na D4Sign: é o código no endereço da página", segredo: false },
  { campo: "emailsLone", rotulo: "E-mails de quem assina pela Lone", onde: "os e-mails com que Roberto e Lucas assinam na D4Sign, separados por vírgula", segredo: false },
];

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export default function D4SignChaves() {
  const [sit, setSit] = useState<Situacao | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<Campo, string>>({ token: "", cryptKey: "", hmac: "", cofre: "", emailsLone: "" });
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [ligando, setLigando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const carregar = async () => {
    const r = await chamar<Situacao>("/api/contracts/d4sign/config");
    if (!r.ok || !r.data) { setErroLeitura(r.erro ?? "Não consegui ler a configuração da D4Sign."); return; }
    setErroLeitura(null);
    setSit(r.data);
  };
  useEffect(() => { void carregar(); }, []);

  const salvar = async (apagar: Campo[] = []) => {
    setSalvando(true); setMsg(null);
    const novos = Object.fromEntries(Object.entries(valores).filter(([, v]) => v.trim())) as Partial<Record<Campo, string>>;
    const r = await chamar("/api/contracts/d4sign/config", { acao: "salvar", novos, apagar });
    setSalvando(false);
    if (!r.ok) { setMsg({ ok: false, texto: r.erro ?? "Não salvei." }); return; }
    // O que foi colado sai da tela assim que gravou: a chave não fica no navegador.
    setValores({ token: "", cryptKey: "", hmac: "", cofre: "", emailsLone: "" });
    setMsg({ ok: true, texto: apagar.length ? "Apagado do painel: volta a valer o que estiver no servidor." : "Salvo (cifrado). Clique em Testar para conferir." });
    await carregar();
  };

  const testar = async () => {
    setTestando(true); setMsg(null);
    const r = await chamar<{ ok: boolean; resultado: string }>("/api/contracts/d4sign/config", { acao: "testar" });
    setTestando(false);
    if (!r.ok || !r.data) { setMsg({ ok: false, texto: r.erro ?? "O teste não rodou." }); return; }
    setMsg({ ok: r.data.ok, texto: r.data.resultado });
    await carregar();
  };

  const ligarWebhook = async () => {
    if (!window.confirm("Ligar o aviso da D4Sign? A partir daí a D4Sign avisa o Lone OS de cada assinatura no cofre dos contratos, e o grupo de cadastro passa a receber quem assinou e quem falta.")) return;
    setLigando(true); setMsg(null);
    const r = await chamar<{ ok: boolean; resultado: string }>("/api/contracts/d4sign/config", { acao: "webhook" });
    setLigando(false);
    if (!r.ok || !r.data) { setMsg({ ok: false, texto: r.erro ?? "Não consegui ligar o aviso." }); return; }
    setMsg({ ok: r.data.ok, texto: r.data.resultado });
    await carregar();
  };

  const algoColado = Object.values(valores).some((v) => v.trim());

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <FileSignature size={14} className="text-primary" /> D4Sign (assinatura dos contratos)
        </h3>
        {sit && (
          <span className={`text-[10px] px-2 py-0.5 rounded border ${sit.ligada ? "bg-lone-success-bg text-lone-success border-lone-success-border" : "bg-muted text-muted-foreground border-border"}`}>
            {sit.ligada ? "Ligada" : "Desligada"}
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mb-4">
        Cole cada chave uma vez. Ela é guardada cifrada e nunca volta para a tela — para trocar, cole de novo.
        O que ficar vazio aqui usa o que estiver no servidor.
      </p>

      {erroLeitura && (
        <p role="alert" className="mb-4 rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-xs text-lone-danger">
          {erroLeitura} <button onClick={() => void carregar()} className="underline">Tentar de novo</button>
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CAMPOS.map(({ campo, rotulo, onde, segredo }) => {
          const c = sit?.campos[campo];
          return (
            <div key={campo} className="space-y-1.5">
              <label htmlFor={`d4sign-${campo}`} className="text-[10px] text-muted-foreground uppercase tracking-wider">{rotulo}</label>
              <input
                id={`d4sign-${campo}`}
                type={segredo ? "password" : "text"}
                autoComplete="off" spellCheck={false}
                value={valores[campo]}
                onChange={(e) => setValores((p) => ({ ...p, [campo]: e.target.value }))}
                placeholder={c?.configurado
                  ? (segredo ? "•••••• configurada — cole para trocar" : campo === "cofre" ? sit?.cofre ?? "" : sit?.emailsLone.join(", ") ?? "")
                  : "cole aqui"}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
              />
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">{onde}</span>
                {c && (
                  <span className={c.configurado ? "text-lone-success" : "text-lone-warning"}>
                    {c.origem === "painel" ? "no painel" : c.origem === "servidor" ? "no servidor" : "falta"}
                    {c.origem === "painel" && (
                      <button onClick={() => void salvar([campo])} disabled={salvando} className="ml-2 underline text-muted-foreground hover:text-lone-danger">apagar</button>
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-5">
        <button onClick={() => void salvar()} disabled={salvando || !algoColado}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground text-xs font-medium disabled:opacity-50">
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar chaves
        </button>
        <button onClick={() => void testar()} disabled={testando || !sit?.ligada}
          title={sit?.ligada ? "Lê o cofre na D4Sign com as chaves de agora (gasta 1 das 10 chamadas da hora)" : "Falta o token da API"}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs font-medium hover:border-primary/40 disabled:opacity-50">
          {testando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Testar
        </button>
        <button onClick={() => void ligarWebhook()} disabled={ligando || !sit?.ligada || !sit?.campos.hmac.configurado || !sit?.campos.cofre.configurado}
          title="Cadastra na D4Sign o aviso de cada assinatura do cofre para este painel. Antes, na D4Sign: Opções da conta › Dev (API) › Webhook › Ativar Webhook 2.0."
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs font-medium hover:border-primary/40 disabled:opacity-50">
          {ligando ? <Loader2 size={12} className="animate-spin" /> : <FileSignature size={12} />} Ligar o aviso da D4Sign
        </button>
        {sit?.atualizadoEm && (
          <span className="text-[10px] text-muted-foreground">Última troca: {quando(sit.atualizadoEm)} por {sit.atualizadoPor}</span>
        )}
      </div>

      {msg && (
        <p role="status" className={`mt-3 flex items-start gap-1.5 text-xs ${msg.ok ? "text-lone-success" : "text-lone-danger"}`}>
          {msg.ok ? <CheckCircle size={13} className="mt-0.5 shrink-0" /> : <XCircle size={13} className="mt-0.5 shrink-0" />} {msg.texto}
        </p>
      )}
      {!msg && sit?.testadoEm && (
        <p className={`mt-3 text-xs ${sit.testeOk ? "text-lone-success" : "text-lone-danger"}`}>
          Teste de {quando(sit.testadoEm)}: {sit.testeResultado}
        </p>
      )}

      {!!sit?.historico.length && (
        <details className="mt-4">
          <summary className="text-[10px] text-muted-foreground cursor-pointer">Quem mexeu (últimas {sit.historico.length})</summary>
          <ul className="mt-2 space-y-1 text-[10px] text-muted-foreground">
            {sit.historico.map((h, i) => (
              <li key={i}>
                {quando(h.quando)} · {h.quem} {h.acao}{h.campos.length ? `: ${h.campos.join(", ")}` : ""}{h.resultado ? ` (${h.resultado})` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
