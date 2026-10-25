"use client";

// components/client/ficha/SenhasAnteriores.tsx — "Senhas anteriores" de UM campo do cofre (aba Admin).
//
// 25/10/2026 (onda 5 da auditoria de erro recuperável): a senha que estava no cofre antes de cada troca
// fica guardada (onda 2), mas só o "Desfazer" de ~15 s do aviso chegava nela. Aqui: a lista com data e
// quem trocou (sem a senha), "Ver" que revela só para admin (registrado como o revelar da senha atual) e
// "Restaurar esta" com confirmação, pela ação `restaurar` de /api/client-vault. As senhas reveladas
// ficam só na memória desta caixa e somem ao fechar. Nunca vão para log nem console.

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, History, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { rotuloDoCampo } from "@/lib/cofre/versoes";
import { confirmacaoRestaurar, descreverVersao, type VersaoAnterior } from "@/lib/cofre/senhas-anteriores";

interface Lista { disponivel: boolean; versoes: VersaoAnterior[] }

export default function SenhasAnteriores({ clientId, field, onRestaurada }: {
  clientId: string;
  /** Coluna de `clients` (facebook_password, instagram_password, google_ads_password). */
  field: string;
  /** Depois de restaurar: a tela de cima esquece a senha que estava revelada (não vale mais). */
  onRestaurada?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<Lista | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [reveladas, setReveladas] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const rotulo = rotuloDoCampo(field);
  const base = `/api/client-vault/anteriores?clientId=${encodeURIComponent(clientId)}&field=${encodeURIComponent(field)}`;

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroLista(null);
    const r = await chamar<Lista>(base);
    setCarregando(false);
    if (!r.ok || !r.data) { setLista(null); setErroLista(r.erro ?? "Não consegui ler as senhas anteriores."); return; }
    setLista(r.data);
  }, [base]);

  const alternar = () => {
    if (aberto) {
      // Fechou: as senhas reveladas não ficam na memória da tela.
      setAberto(false); setReveladas({}); setErroAcao(null);
      return;
    }
    setAberto(true);
    void carregar();
  };

  const ver = async (v: VersaoAnterior) => {
    if (reveladas[v.id] !== undefined) {
      setReveladas((p) => { const n = { ...p }; delete n[v.id]; return n; });
      return;
    }
    setOcupado(`ver:${v.id}`); setErroAcao(null);
    const r = await chamar<{ value: string | null }>(`${base}&versaoId=${encodeURIComponent(v.id)}`);
    setOcupado(null);
    if (!r.ok) { setErroAcao(`Não consegui mostrar esta senha: ${r.erro}`); return; }
    setReveladas((p) => ({ ...p, [v.id]: r.data?.value ?? "" }));
  };

  const restaurar = async (v: VersaoAnterior) => {
    if (!window.confirm(confirmacaoRestaurar(field, v))) return;
    setOcupado(`restaurar:${v.id}`); setErroAcao(null);
    const r = await chamar<{ aviso?: string | null }>("/api/client-vault", {
      acao: "restaurar", clientId, table: "clients", field, versaoId: v.id,
    });
    setOcupado(null);
    // A falha aparece aqui, junto da linha que a pessoa tentou — e nada mudou no cofre.
    if (!r.ok) { setErroAcao(`Não restaurei a senha do ${rotulo}: ${r.erro} Nada foi trocado.`); return; }
    toast.success(`Senha do ${rotulo} restaurada. A que estava antes ficou guardada nesta lista.`);
    if (r.data?.aviso) toast.warning(r.data.aviso, { duration: 20000 });
    setReveladas({});
    onRestaurada?.();
    await carregar();
  };

  const copiar = (texto: string) => {
    navigator.clipboard?.writeText(texto).then(() => toast.success("Senha copiada."), () => toast.error("Não consegui copiar."));
  };

  return (
    <div className="border-t border-border pt-2">
      <button type="button" onClick={alternar} aria-expanded={aberto}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
        <History size={11} aria-hidden="true" /> {aberto ? "Esconder senhas anteriores" : "Senhas anteriores"}
      </button>

      {aberto && (
        <div className="mt-2 space-y-2" aria-label={`Senhas anteriores do ${rotulo}`}>
          {carregando && !lista ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 size={11} className="animate-spin" aria-hidden="true" /> Carregando…</p>
          ) : erroLista ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-lone-danger-border bg-lone-danger-bg px-2 py-1.5 text-[11px] text-lone-danger">
              <span>{erroLista}</span>
              <button type="button" onClick={() => void carregar()} className="inline-flex items-center gap-1 font-medium underline">
                <RefreshCw size={10} aria-hidden="true" /> Tentar de novo
              </button>
            </div>
          ) : lista && !lista.disponivel ? (
            <p className="text-[11px] text-lone-warning">O histórico de senhas ainda não está ativo no banco (migration 20261021170000).</p>
          ) : lista && lista.versoes.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Nenhuma senha anterior guardada. A partir da próxima troca, a que sair fica aqui.</p>
          ) : lista ? (
            <ul className="space-y-1.5">
              {lista.versoes.map((v) => {
                const revelada = reveladas[v.id];
                return (
                  <li key={v.id} className="rounded-md border border-border bg-card px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{descreverVersao(v)}</p>
                    {revelada !== undefined && (
                      <div className="mt-1 flex items-center gap-2">
                        <code className="flex-1 break-all font-mono text-xs text-foreground">{revelada || <span className="italic text-muted-foreground">(vazia)</span>}</code>
                        {revelada && (
                          <button type="button" onClick={() => copiar(revelada)} title="Copiar" aria-label="Copiar senha"
                            className="text-muted-foreground hover:text-primary"><Copy size={11} /></button>
                        )}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => void ver(v)} disabled={!!ocupado}
                        className="inline-flex h-6 items-center gap-1 rounded border border-border px-1.5 text-[11px] text-foreground hover:bg-accent disabled:opacity-40">
                        {ocupado === `ver:${v.id}` ? <Loader2 size={10} className="animate-spin" aria-hidden="true" />
                          : revelada !== undefined ? <EyeOff size={10} aria-hidden="true" /> : <Eye size={10} aria-hidden="true" />}
                        {revelada !== undefined ? "Esconder" : "Ver"}
                      </button>
                      <button type="button" onClick={() => void restaurar(v)} disabled={!!ocupado}
                        className="inline-flex h-6 items-center gap-1 rounded border border-border px-1.5 text-[11px] text-foreground hover:bg-accent disabled:opacity-40">
                        {ocupado === `restaurar:${v.id}` ? <Loader2 size={10} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={10} aria-hidden="true" />}
                        Restaurar esta
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {erroAcao && <p role="alert" className="rounded-md border border-lone-danger-border bg-lone-danger-bg px-2 py-1.5 text-[11px] text-lone-danger">{erroAcao}</p>}
        </div>
      )}
    </div>
  );
}
