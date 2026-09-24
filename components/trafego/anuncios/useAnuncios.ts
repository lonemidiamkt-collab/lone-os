"use client";

// Dados da aba "Anúncios Meta": o que o servidor já leu da Meta (GET /api/trafego/anuncios) e o
// "Atualizar agora" (POST, lido no servidor). O navegador não tem token nem chama a Meta.
//
// Regras de atualização:
//  - Abriu um cliente cuja leitura é mais velha que VELHO_APOS_MIN (ou nunca foi lida) → atualiza
//    sozinho, uma vez por cliente+período enquanto a aba está aberta, mostrando o que já havia.
//  - "Atualizar agora" → pede ao servidor; ele recusa se a última tentativa tem menos de 5 min.
//  - Conta grande (> ~20s) continua no servidor; aqui a tela consulta a cada 5s até terminar.
//  - "Atualizar todos" (visão Todos) → um cliente por vez (dois em paralelo), pulando quem foi lido
//    há menos de 30 min.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { minutosDesde, precisaAtualizar, type EstadoConexao, type ResumoAnuncios } from "@/lib/trafego/anuncios";
import type { AdCampaign } from "@/lib/types";

export interface Demografia {
  ageRanges: { range: string; percentage: number }[];
  /** null = a Meta não soube o gênero (antes vinha um 50/50 inventado). */
  genderSplit: { women: number; men: number } | null;
}

export interface ItemAnuncios {
  clientId: string;
  sincronizadoEm: string | null;
  tentativaEm: string | null;
  erro: string | null;
  atualizando: boolean;
  resumo: ResumoAnuncios;
  campanhas?: AdCampaign[];
  demografia?: Demografia | null;
}

export interface ConexaoAnuncios {
  estado: EstadoConexao;
  expiraEm: number | null;
  tipo: "short" | "long" | null;
}

interface RespostaGet {
  periodo: string;
  conexao: ConexaoAnuncios;
  persistente: boolean;
  itens: ItemAnuncios[];
}

type Resultado = "ok" | "aguarde" | "em_andamento" | "ocupado" | "sem_conexao" | "falhou";
interface RespostaPost {
  resultado: Resultado;
  mensagem?: string;
  esperarMin?: number;
  conexao?: ConexaoAnuncios;
  item?: ItemAnuncios;
}

const url = (periodo: string, ids: string[], completo: boolean) =>
  `/api/trafego/anuncios?periodo=${encodeURIComponent(periodo)}&clientes=${ids.join(",")}${completo ? "&completo=1" : ""}`;

const PULAR_TODOS_MIN = 30;
const POLL_MS = 5_000;
const POLL_MAX = 60; // 5 min

export function useAnuncios({ periodo, clientesIds, selecionado }: {
  periodo: string;
  /** Clientes com conta Meta vinculada no workspace atual. */
  clientesIds: string[];
  /** Cliente aberto (visão detalhada) ou null na visão "Todos". */
  selecionado: string | null;
}) {
  const [resumo, setResumo] = useState<Map<string, ItemAnuncios>>(new Map());
  const [detalhe, setDetalhe] = useState<ItemAnuncios | null>(null);
  const [conexao, setConexao] = useState<ConexaoAnuncios | null>(null);
  const [persistente, setPersistente] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState<Set<string>>(new Set());
  const [progressoTodos, setProgressoTodos] = useState<{ feitos: number; total: number } | null>(null);
  // Relógio do "atualizado há X min".
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const chaveIds = clientesIds.join(",");
  const reqRef = useRef(0);
  const autoFeito = useRef<Set<string>>(new Set());
  const pollRef = useRef<Map<string, number>>(new Map());
  const vivo = useRef(true);
  useEffect(() => () => {
    vivo.current = false;
    pollRef.current.forEach((t) => clearTimeout(t));
  }, []);

  // Cliente aberto AGORA (o resultado de uma leitura pode chegar depois de trocar de cliente).
  const selRef = useRef(selecionado);
  selRef.current = selecionado;

  const aplicarItem = useCallback((item: ItemAnuncios) => {
    setResumo((m) => new Map(m).set(item.clientId, { ...item, campanhas: undefined, demografia: undefined }));
    setDetalhe((d) => (item.campanhas && selRef.current === item.clientId && (!d || d.clientId === item.clientId) ? item : d));
  }, []);

  const marcar = useCallback((clientId: string, on: boolean) => {
    setAtualizando((s) => {
      const n = new Set(s);
      if (on) n.add(clientId); else n.delete(clientId);
      return n;
    });
  }, []);

  // ── Leitura do que o servidor guardou ────────────────────────────────────
  const carregar = useCallback(async () => {
    const req = ++reqRef.current;
    setCarregando(true);
    const ids = chaveIds ? chaveIds.split(",") : [];
    const [r, d] = await Promise.all([
      ids.length ? chamar<RespostaGet>(url(periodo, ids, false)) : Promise.resolve(null),
      selecionado ? chamar<RespostaGet>(url(periodo, [selecionado], true)) : Promise.resolve(null),
    ]);
    if (req !== reqRef.current || !vivo.current) return;
    const falha = (r && !r.ok ? r.erro : null) ?? (d && !d.ok ? d.erro : null);
    setErroCarga(falha);
    const base = d?.data ?? r?.data;
    if (base) { setConexao(base.conexao); setPersistente(base.persistente); }
    if (r?.data) setResumo(new Map(r.data.itens.map((i) => [i.clientId, i])));
    setDetalhe(d?.data?.itens[0] ?? null);
    setCarregando(false);
  }, [periodo, chaveIds, selecionado]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Acompanhar leitura longa que ficou rodando no servidor ───────────────
  const acompanhar = useCallback((clientId: string, tentativas = 0) => {
    const t = window.setTimeout(async () => {
      pollRef.current.delete(clientId);
      if (!vivo.current) return;
      const r = await chamar<RespostaGet>(url(periodo, [clientId], true));
      const item = r.data?.itens[0];
      if (item && !item.atualizando) {
        aplicarItem(item);
        if (r.data) setConexao(r.data.conexao);
        marcar(clientId, false);
        if (item.erro) toast.error("A leitura da Meta terminou com erro. Veja o aviso na tela.");
        return;
      }
      if (tentativas + 1 >= POLL_MAX) { marcar(clientId, false); return; }
      acompanhar(clientId, tentativas + 1);
    }, POLL_MS);
    pollRef.current.set(clientId, t);
  }, [periodo, aplicarItem, marcar]);

  /** Espera uma leitura longa terminar no servidor (usado pelo "Atualizar todos", que vai um por vez). */
  const aguardarLeitura = useCallback(async (clientId: string): Promise<"ok" | "falhou"> => {
    for (let i = 0; i < POLL_MAX && vivo.current; i++) {
      await new Promise((ok) => setTimeout(ok, POLL_MS));
      const r = await chamar<RespostaGet>(url(periodo, [clientId], false));
      const item = r.data?.itens[0];
      if (item && !item.atualizando) {
        aplicarItem(item);
        return item.erro ? "falhou" : "ok";
      }
    }
    return "falhou";
  }, [periodo, aplicarItem]);

  // ── Atualizar agora ──────────────────────────────────────────────────────
  const atualizar = useCallback(async (clientId: string, opts?: { silencioso?: boolean; aguardar?: boolean }): Promise<Resultado | "erro"> => {
    marcar(clientId, true);
    const r = await chamar<RespostaPost>("/api/trafego/anuncios", { clientId, periodo });
    if (!vivo.current) return "erro";
    if (!r.ok || !r.data) {
      marcar(clientId, false);
      if (!opts?.silencioso) toast.error(r.erro ?? "Não consegui atualizar agora.");
      return "erro";
    }
    const { resultado, mensagem, conexao: c, item } = r.data;
    if (c) setConexao(c);
    if (item) aplicarItem(item);
    if (resultado === "em_andamento") {
      if (opts?.aguardar) {
        const fim = await aguardarLeitura(clientId);
        marcar(clientId, false);
        return fim;
      }
      if (!opts?.silencioso && mensagem) toast.message(mensagem);
      acompanhar(clientId);
      return resultado;
    }
    marcar(clientId, false);
    if (!opts?.silencioso) {
      if (resultado === "ok") toast.success("Anúncios atualizados com a Meta.");
      else if (resultado === "falhou" || resultado === "sem_conexao") toast.error(mensagem ?? "A Meta não respondeu.");
      else if (mensagem) toast.message(mensagem);
    }
    return resultado;
  }, [periodo, marcar, aplicarItem, acompanhar, aguardarLeitura]);

  // Abriu um cliente com leitura velha (ou nenhuma): atualiza sozinho, uma vez.
  useEffect(() => {
    if (!selecionado || !detalhe || detalhe.clientId !== selecionado || carregando) return;
    if (conexao?.estado !== "ok") return;
    const chave = `${selecionado}|${periodo}`;
    if (autoFeito.current.has(chave)) return;
    if (detalhe.atualizando) { autoFeito.current.add(chave); marcar(selecionado, true); acompanhar(selecionado); return; }
    if (!precisaAtualizar(detalhe.sincronizadoEm, Date.now())) return;
    autoFeito.current.add(chave);
    atualizar(selecionado, { silencioso: true });
  }, [selecionado, detalhe, carregando, conexao, periodo, atualizar, acompanhar, marcar]);

  // ── Atualizar todos (visão "Todos") ──────────────────────────────────────
  const atualizarTodos = useCallback(async () => {
    if (progressoTodos) return;
    const alvo = (chaveIds ? chaveIds.split(",") : []).filter((id) => {
      const min = minutosDesde(resumo.get(id)?.sincronizadoEm, Date.now());
      return min === null || min >= PULAR_TODOS_MIN;
    });
    if (alvo.length === 0) { toast.message(`Todos os clientes foram lidos há menos de ${PULAR_TODOS_MIN} min.`); return; }
    setProgressoTodos({ feitos: 0, total: alvo.length });
    let feitos = 0, falhas = 0, parouPorConexao = false;
    const fila = [...alvo];
    const trabalhador = async () => {
      while (fila.length && vivo.current && !parouPorConexao) {
        const id = fila.shift()!;
        let res: Resultado | "erro" = "ocupado";
        for (let i = 0; i < 4 && res === "ocupado"; i++) {
          if (i > 0) await new Promise((ok) => setTimeout(ok, 5_000));
          res = await atualizar(id, { silencioso: true, aguardar: true });
        }
        if (res === "sem_conexao") parouPorConexao = true;
        if (res === "falhou" || res === "erro" || res === "ocupado") falhas++;
        feitos++;
        if (vivo.current) setProgressoTodos({ feitos, total: alvo.length });
      }
    };
    await Promise.all([trabalhador(), trabalhador()]);
    if (!vivo.current) return;
    setProgressoTodos(null);
    if (parouPorConexao) toast.error("Parei: a conexão com a Meta caiu. Veja o aviso no topo.");
    else if (falhas > 0) toast.warning(`${alvo.length - falhas} de ${alvo.length} clientes atualizados — ${falhas} com falha na Meta.`);
    else toast.success(`${alvo.length} cliente(s) atualizados com a Meta.`);
  }, [chaveIds, resumo, atualizar, progressoTodos]);

  /** Campanhas completas de vários clientes (PDF "Todos os Clientes"). Lê só o que está guardado. */
  const lerCompletos = useCallback(async (ids: string[]): Promise<{ itens: ItemAnuncios[]; erro: string | null }> => {
    const itens: ItemAnuncios[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const r = await chamar<RespostaGet>(url(periodo, ids.slice(i, i + 10), true));
      if (!r.ok || !r.data) return { itens, erro: r.erro ?? "Falha ao ler os anúncios guardados." };
      itens.push(...r.data.itens);
    }
    return { itens, erro: null };
  }, [periodo]);

  return {
    resumo, detalhe, conexao, persistente, carregando, erroCarga, atualizando, progressoTodos, agora,
    recarregar: carregar, atualizar, atualizarTodos, lerCompletos,
  };
}
