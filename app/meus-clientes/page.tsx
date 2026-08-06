"use client";

// /meus-clientes — a carteira de QUEM EXECUTA (social, tráfego, designer), com o briefing.
//
// POR QUE UMA TELA NOVA E NÃO ABRIR /clients (Roberto, 05/08). A tela de Clientes é da GESTÃO:
// cofre de acessos, contratos, dados de cobrança. Liberar ela pra resolver o briefing entregaria
// junto um monte de coisa que não é do time de execução. Aqui vai só a carteira e o briefing.
//
// E POR ISSO A GESTÃO NÃO VÊ ESTA ABA: ela já tem /clients, com tudo. Duas abas de cliente pro
// admin era duplicidade — foi o que o Roberto apontou na primeira versão.
//
// O BRIEFING É O PONTO. É dele que o agente tira roteiro e planejamento; briefing pobre vira
// roteiro genérico. Aqui a pessoa cola o texto OU solta o PDF que o cliente mandou (tabela de
// preço, catálogo), o sistema lê e isso vira base do conteúdo.

import { useEffect, useMemo, useState } from "react";
import { useRole } from "@/lib/context/RoleContext";
import { useClientsStore } from "@/stores/useClientsStore";
import BriefingEstrategico from "@/components/client-tabs/BriefingEstrategico";
import { Input } from "@/components/ui/input";
import { Users, Search, ChevronLeft, FileText, AlertCircle } from "lucide-react";

export default function MeusClientesPage() {
  const { role, currentUser } = useRole();
  const clients = useClientsStore((s) => s.clients);
  const initClients = useClientsStore((s) => s.init);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => { initClients(); }, [initClients]);

  // CADA PAPEL TEM SUA CARTEIRA, EM CAMPO DIFERENTE. Filtrar sempre por assignedSocial deixaria
  // tráfego e designer com a aba vazia — eles têm cliente atribuído em outra coluna.
  // A gestão não usa esta tela (tem /clients); se cair aqui, vê tudo em vez de nada.
  const meus = useMemo(() => {
    const carteiraDe = (c: (typeof clients)[number]) =>
      role === "traffic" ? c.assignedTraffic
      : role === "designer" ? c.assignedDesigner
      : role === "social" ? c.assignedSocial
      : null; // gestão: sem filtro
    const base = clients.filter((c) => {
      const dono = carteiraDe(c);
      return dono === null || dono === currentUser;
    });
    const t = busca.trim().toLowerCase();
    return base
      .filter((c) => !t || (c.nomeFantasia || c.name).toLowerCase().includes(t))
      .sort((a, b) => (a.nomeFantasia || a.name).localeCompare(b.nomeFantasia || b.name));
  }, [clients, role, currentUser, busca]);

  const cliente = aberto ? clients.find((c) => c.id === aberto) : null;

  if (cliente) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button onClick={() => setAberto(null)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft size={14} /> Meus clientes
        </button>
        <h1 className="text-lone-h1 font-brand text-foreground mb-1">{cliente.nomeFantasia || cliente.name}</h1>
        <p className="text-xs text-muted-foreground mb-5">
          O briefing é a base do roteiro e do planejamento. Quanto melhor aqui, menos genérico lá.
        </p>
        <BriefingEstrategico clientId={cliente.id} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Users size={20} className="text-primary" />
        <h1 className="text-lone-h1 font-brand text-foreground">Meus clientes</h1>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Sua carteira. Abra um cliente pra montar o briefing — é dele que sai o conteúdo.
      </p>

      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…" className="pl-9" />
      </div>

      {meus.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <AlertCircle size={22} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {busca ? "Nenhum cliente com esse nome." : "Você ainda não tem clientes na carteira. Fale com a gestão."}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {meus.map((c) => (
            <button key={c.id} onClick={() => setAberto(c.id)}
              className="text-left rounded-xl border border-border bg-card p-3.5 hover:border-primary/40 transition-colors">
              <p className="text-sm font-medium text-foreground truncate">{c.nomeFantasia || c.name}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                <FileText size={11} /> abrir briefing
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
