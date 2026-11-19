"use client";

// components/integracoes/ConexaoGoogleMarketing.tsx — os botões da conexão de Google Ads e Perfil da Empresa, dentro
// do cartão em Sistema › Integrações. O ESTADO quem mostra é o cartão (lib/integracoes/catalogo.ts); aqui ficam as
// ações, só para admin. A credencial do app é a mesma do cartão Google (Agenda e Drive).

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2Off, RefreshCw } from "lucide-react";
import { chamar } from "@/lib/api/chamar";

interface Estado { configurado: boolean; conectado: boolean; email: string | null; ads: boolean; perfil: boolean; podeAlterar: boolean }

export default function ConexaoGoogleMarketing({ onMudou }: { onMudou?: () => void }) {
  const [e, setE] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const carregar = () => chamar<Estado>("/api/integracoes/google-marketing").then((r) => {
    if (r.ok && r.data) { setE(r.data); setErro(null); } else setErro(r.erro ?? "Não consegui ler a conexão do Google Ads.");
  });
  useEffect(() => { void carregar(); }, []);

  async function conectar() {
    setOcupado(true);
    const r = await chamar<{ url: string }>("/api/integracoes/google-marketing", { acao: "conectar" });
    setOcupado(false);
    if (!r.ok || !r.data?.url) { toast.error(r.erro ?? "Não consegui abrir o Google."); return; }
    window.location.href = r.data.url;
  }
  async function desconectar() {
    if (!window.confirm("Desconectar Google Ads e Perfil da Empresa? A leitura diária para e os próximos relatórios saem sem os números do Google até conectar de novo.")) return;
    const r = await chamar("/api/integracoes/google-marketing", undefined, { method: "DELETE" });
    if (!r.ok) { toast.error(r.erro ?? "Não consegui desconectar."); return; }
    toast.success("Google Ads e Perfil da Empresa desconectados.");
    void carregar(); onMudou?.();
  }

  if (erro) return <p className="text-lone-caption text-lone-danger">{erro} <button onClick={() => void carregar()} className="underline">Tentar de novo</button></p>;
  if (!e) return null;
  if (!e.podeAlterar) return <p className="text-lone-caption text-muted-foreground">Conectar e desconectar é com um sócio (admin).</p>;
  if (!e.configurado) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={ocupado} onClick={() => void conectar()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          <RefreshCw size={14} aria-hidden="true" /> {ocupado ? "Abrindo o Google…" : e.conectado ? "Reconectar" : "Conectar Google Ads e Perfil"}
        </button>
        {e.conectado && (
          <button onClick={() => void desconectar()} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-muted-foreground hover:text-lone-danger">
            <Link2Off size={14} aria-hidden="true" /> Desconectar
          </button>
        )}
      </div>
      <p className="text-lone-caption text-muted-foreground">
        Entre com a conta Google que é gerente das contas de anúncio (ou do MCC), dos perfis e do Google Analytics dos clientes, e marque todas as permissões. O Lone OS só lê: não mexe em campanha, no perfil nem no site.
      </p>
    </div>
  );
}
