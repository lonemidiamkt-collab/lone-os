"use client";

// components/client/ficha/PastaDoDrive.tsx — a pasta do cliente no Google Drive da Lone (lib/drive/).
// Mora na aba Marca & Briefing, ao lado da identidade visual: é onde o social e o designer procuram
// material. Fotos e Vídeos todo mundo da ficha vê; Documentos e a pasta inteira, só admin (o Drive também
// barra quem não é). A pasta nasce sozinha no fim do cadastro; aqui ficam o "Criar"/"Tentar de novo" e o
// "Atualizar" (documentos da ficha e acesso de social/designer). Falha aparece como falha, com o que fazer.

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, FolderOpen, KeyRound, Loader2, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { dataHoraCurta } from "./rotulos";

interface Estado {
  existe: boolean;
  fotos: string | null;
  documentos: string | null;
  pasta: string | null;
  driveLinkDiferente: boolean;
  editam: string[];
  sincronizadoEm: string | null;
  erro: string | null;
  avisos: string[];
  trabalhando: boolean;
  verDocumentos: boolean;
  podeCriar: boolean;
  google: { conectado: boolean; drive: boolean | null; email: string | null };
}

const AGENDA_COMERCIAL = "https://comercial.lonemidia.com/crm?aba=agenda";

const chip = "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-lone-caption hover:bg-accent";
const botao = "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium disabled:opacity-50";

export default function PastaDoDrive({ clientId }: { clientId: string }) {
  const [e, setE] = useState<Estado | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const voltas = useRef(0);

  const carregar = useCallback(async () => {
    const r = await chamar<Estado>(`/api/clients/${clientId}/drive`);
    if (r.status === 403) { setE(null); setErroLeitura(null); return; } // papel sem a ficha: o bloco some
    if (!r.ok || !r.data) { setErroLeitura(r.erro ?? "Não consegui ler a pasta do Drive."); return; }
    setErroLeitura(null); setE(r.data);
  }, [clientId]);
  useEffect(() => { void carregar(); }, [carregar]);

  // Outra sincronia rodando (o cadastro acabou de terminar): olha de novo a cada 5 s, por até 1 min.
  useEffect(() => {
    if (!e?.trabalhando || voltas.current >= 12) return;
    const t = setTimeout(() => { voltas.current += 1; void carregar(); }, 5000);
    return () => clearTimeout(t);
  }, [e, carregar]);

  const criarOuAtualizar = async () => {
    setOcupado(true);
    const r = await chamar<{ criada: boolean; avisos: string[] }>(`/api/clients/${clientId}/drive`, {});
    setOcupado(false);
    voltas.current = 0;
    if (!r.ok || !r.data) { toast.error(r.erro ?? "A pasta não foi criada."); await carregar(); return; }
    toast.success(r.data.criada ? "Pasta criada no Drive." : "Pasta do Drive em dia.");
    if (r.data.avisos.length) toast.warning(`${r.data.avisos.length === 1 ? "Um ponto ficou" : `${r.data.avisos.length} pontos ficaram`} pela metade — veja abaixo.`);
    await carregar();
  };

  if (erroLeitura) {
    return (
      <p className="text-lone-caption text-lone-danger">
        {erroLeitura}{" "}
        <button onClick={() => void carregar()} className="underline hover:no-underline">Tentar de novo</button>
      </p>
    );
  }
  if (!e) return <p className="text-lone-caption text-muted-foreground">Carregando a pasta do Drive…</p>;

  const googleFalta = !e.google.conectado || e.google.drive === false;

  return (
    <div className="space-y-3">
      {e.existe ? (
        <>
          <div className="flex flex-wrap gap-2">
            {e.fotos && (
              <a href={e.fotos} target="_blank" rel="noopener noreferrer" className={`${chip} text-primary`}>
                <FolderOpen size={14} aria-hidden="true" /> Fotos e Vídeos <ExternalLink size={11} aria-hidden="true" />
              </a>
            )}
            {e.verDocumentos && e.documentos && (
              <a href={e.documentos} target="_blank" rel="noopener noreferrer" className={`${chip} text-foreground`}>
                <Lock size={13} aria-hidden="true" /> Documentos <span className="text-muted-foreground">(só admin)</span> <ExternalLink size={11} aria-hidden="true" />
              </a>
            )}
            {e.verDocumentos && e.pasta && (
              <a href={e.pasta} target="_blank" rel="noopener noreferrer" className={`${chip} text-muted-foreground`}>
                Pasta inteira <ExternalLink size={11} aria-hidden="true" />
              </a>
            )}
          </div>
          <p className="text-lone-caption text-muted-foreground">
            {e.editam.length
              ? <>Editam Fotos e Vídeos: <span className="text-foreground">{e.editam.join(", ")}</span>.</>
              : "Ninguém da equipe recebeu acesso a Fotos e Vídeos ainda (o cliente está sem social e sem designer?)."}
            {" "}O acesso acompanha o social e o designer do cadastro.
          </p>
          {e.driveLinkDiferente && (
            <p className="text-lone-caption text-muted-foreground">
              O botão &ldquo;Drive&rdquo; dos pedidos de arte aponta para um link que já existia antes desta pasta.
            </p>
          )}
        </>
      ) : !e.erro && (
        <p className="text-lone-body text-muted-foreground">
          Este cliente ainda não tem pasta no Drive. Ela nasce sozinha quando o cliente termina o cadastro pelo link.
        </p>
      )}

      <p className="flex items-center gap-1.5 text-lone-caption text-muted-foreground">
        <KeyRound size={12} aria-hidden="true" /> Senhas não vão para o Drive: ficam no cofre do Lone OS (aba Admin).
      </p>

      {e.trabalhando && (
        <p className="flex items-center gap-1.5 text-lone-caption text-muted-foreground">
          <Loader2 size={12} className="animate-spin" aria-hidden="true" /> A pasta está sendo criada ou atualizada agora…
        </p>
      )}

      {e.erro && (
        <div className="rounded-lg border border-lone-danger-border bg-lone-danger-bg p-3 text-lone-caption text-lone-danger">
          <p className="flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" /> {e.erro}</p>
        </div>
      )}

      {e.avisos.length > 0 && !e.erro && (
        <ul className="space-y-1 rounded-lg border border-lone-warning-border bg-lone-warning-bg p-3 text-lone-caption text-lone-warning">
          {e.avisos.map((a, i) => <li key={i} className="flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> {a}</li>)}
        </ul>
      )}

      {e.podeCriar && googleFalta && (
        <p className="text-lone-caption text-muted-foreground">
          {!e.google.conectado ? "O Google da Lone não está conectado." : "O Google da Lone ainda não liberou o Drive."}{" "}
          Um sócio resolve em{" "}
          <a href={AGENDA_COMERCIAL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Comercial › Agenda</a>
          {e.google.conectado ? ' (botão "Reconectar Google").' : "."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {e.podeCriar && (
          <button disabled={ocupado || e.trabalhando} onClick={() => void criarOuAtualizar()}
            className={e.existe && !e.erro ? `${botao} border border-border bg-card text-foreground hover:bg-accent` : `${botao} bg-primary text-primary-foreground hover:opacity-90`}>
            {ocupado ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
            {ocupado ? "Falando com o Drive…" : !e.existe ? (e.erro ? "Tentar de novo" : "Criar pasta no Drive") : e.erro ? "Tentar de novo" : "Atualizar pasta"}
          </button>
        )}
        {e.sincronizadoEm && (
          <span className="text-lone-caption text-muted-foreground">Atualizada em {dataHoraCurta(e.sincronizadoEm)}</span>
        )}
      </div>
    </div>
  );
}
