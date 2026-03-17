"use client";

import Header from "@/components/Header";
import { mockClients } from "@/lib/mockData";
import { formatCurrency, getAttentionColor, getAttentionLabel, getStatusColor, getStatusLabel } from "@/lib/utils";
import { Lock, Unlock, BarChart2, TrendingUp, TrendingDown, DollarSign, FileText, Eye, EyeOff, Shield } from "lucide-react";
import { useState } from "react";

// Mock quinzennial reports
const mockQuinzReports = [
  {
    id: "qr1", clientId: "c1", clientName: "TechVision Soluções",
    period: "01–15 Mar/2026", createdBy: "Ana Lima", createdAt: "2026-03-15",
    communicationHealth: 4, clientEngagement: 5,
    highlights: "Cliente muito satisfeito com os leads gerados pela campanha de Search. ROI de 4.2x no período.",
    challenges: "Criativos estão saturando rapidamente, precisamos de novos assets.",
    nextSteps: "Criar 5 novos criativos em vídeo e testar novas audiências no Meta.",
  },
  {
    id: "qr2", clientId: "c4", clientName: "Fitness Power Academia",
    period: "01–15 Mar/2026", createdBy: "Pedro Alves", createdAt: "2026-03-15",
    communicationHealth: 2, clientEngagement: 1,
    highlights: "Nenhum resultado significativo a destacar no período.",
    challenges: "CPA está 3x acima do meta. Cliente ameaçou cancelar. Budget reduzido sem aviso.",
    nextSteps: "Reunião de alinhamento urgente. Proposta de reestruturação completa da estratégia.",
  },
  {
    id: "qr3", clientId: "c3", clientName: "LuxHome Imóveis",
    period: "01–15 Mar/2026", createdBy: "Carlos Melo", createdAt: "2026-03-15",
    communicationHealth: 5, clientEngagement: 4,
    highlights: "3 imóveis vendidos com atribuição direta às campanhas. Ticket médio de R$850k.",
    challenges: "Aprovação de artes demora muito por parte do cliente.",
    nextSteps: "Propor fluxo de aprovação mais ágil. Ampliar verba para campanhas de vídeo.",
  },
];

const CORRECT_PIN = "1234";

export default function CEOPage() {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "reports" | "ltv">("overview");

  const handleUnlock = () => {
    if (pin === CORRECT_PIN) {
      setUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPin("");
    }
  };

  const totalMRR = mockClients.reduce((sum, c) => sum + c.monthlyBudget, 0);
  const avgTicket = totalMRR / mockClients.length;

  if (!unlocked) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Área da Diretoria" subtitle="Acesso restrito" />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="card max-w-sm w-full text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-brand/20 flex items-center justify-center mx-auto">
              <Lock size={28} className="text-brand-light" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Área Restrita</h2>
              <p className="text-gray-400 text-sm mt-1">
                Esta área é exclusiva para a Diretoria/CEO.<br />
                Insira o PIN de acesso para continuar.
              </p>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => { setPin(e.target.value); setPinError(false); }}
                  onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                  placeholder="••••"
                  maxLength={8}
                  className={`w-full bg-surface-border border ${
                    pinError ? "border-red-500" : "border-surface-border"
                  } rounded-xl px-4 py-3 text-center text-xl font-bold text-white tracking-[0.5em] placeholder-gray-600 outline-none focus:ring-2 focus:ring-brand`}
                />
                <button
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {pinError && (
                <p className="text-red-400 text-sm">PIN incorreto. Tente novamente.</p>
              )}

              <button onClick={handleUnlock} className="btn-primary w-full py-3 text-base">
                Acessar
              </button>

              <p className="text-gray-600 text-xs">PIN padrão de demonstração: 1234</p>
            </div>

            <div className="flex items-center justify-center gap-2 text-gray-600 text-xs">
              <Shield size={12} />
              <span>Acesso monitorado e registrado</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Área da Diretoria" subtitle="Visão confidencial da operação" />

      <div className="p-6 space-y-6 animate-fade-in">
        {/* Unlock banner */}
        <div className="bg-brand/10 border border-brand/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <Unlock size={16} className="text-brand-light" />
          <span className="text-sm text-brand-light font-medium">Acesso CEO ativo</span>
          <button
            onClick={() => { setUnlocked(false); setPin(""); }}
            className="ml-auto text-xs text-gray-400 hover:text-white transition-colors"
          >
            Sair da área restrita
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="card">
            <p className="text-xs text-gray-400">MRR Total</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{formatCurrency(totalMRR)}</p>
            <p className="text-xs text-gray-500 mt-1">receita mensal recorrente</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-400">ARR Projetado</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{formatCurrency(totalMRR * 12)}</p>
            <p className="text-xs text-gray-500 mt-1">anualizado</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-400">Ticket Médio</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">{formatCurrency(avgTicket)}</p>
            <p className="text-xs text-gray-500 mt-1">por cliente</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-400">Risco de Churn</p>
            <p className="text-2xl font-bold text-red-400 mt-1">
              {mockClients.filter((c) => c.status === "at_risk").length} clientes
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {formatCurrency(mockClients.filter((c) => c.status === "at_risk").reduce((s, c) => s + c.monthlyBudget, 0))} em risco
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-1 mb-5 border-b border-surface-border">
            {(["overview", "reports", "ltv"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveSection(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeSection === tab
                    ? "border-brand text-brand-light"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                {tab === "overview" ? "Visão Geral" : tab === "reports" ? "Relatórios Quinzenais" : "Análise LTV"}
              </button>
            ))}
          </div>

          {activeSection === "overview" && (
            <div className="space-y-4 animate-fade-in">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-border">
                      {["Cliente", "Investimento", "Status", "Atenção", "Tags", "Tráfego", "Social"].map((h) => (
                        <th key={h} className="text-left py-2.5 px-3 text-gray-500 font-medium text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mockClients.map((client) => (
                      <tr key={client.id} className="border-b border-surface-border/50 hover:bg-surface-hover/50 transition-colors">
                        <td className="py-3 px-3 font-medium text-white">{client.name}</td>
                        <td className="py-3 px-3 font-semibold text-green-400">{formatCurrency(client.monthlyBudget)}</td>
                        <td className="py-3 px-3">
                          <span className={`badge border text-xs ${getStatusColor(client.status)}`}>
                            {getStatusLabel(client.status)}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`badge border text-xs ${getAttentionColor(client.attentionLevel)}`}>
                            {getAttentionLabel(client.attentionLevel)}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex gap-1 flex-wrap">
                            {client.tags.map((tag) => (
                              <span key={tag} className={`badge border text-xs ${tag === "Premium" ? "tag-premium" : tag === "Risco de Churn" ? "tag-risk" : "tag-matcon"}`}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-gray-400 text-xs">{client.assignedTraffic}</td>
                        <td className="py-3 px-3 text-gray-400 text-xs">{client.assignedSocial}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSection === "reports" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-gray-400 text-sm">Relatórios quinzenais preenchidos pela equipe. Visão exclusiva da diretoria.</p>
              {mockQuinzReports.map((report) => {
                const isGood = report.communicationHealth >= 4;
                const isBad = report.communicationHealth <= 2;
                return (
                  <div key={report.id} className={`card border ${isBad ? "border-red-500/30" : isGood ? "border-green-500/20" : "border-surface-border"}`}>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h4 className="font-semibold text-white">{report.clientName}</h4>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Período: {report.period} · por {report.createdBy}
                        </p>
                      </div>
                      <div className="flex gap-4 text-center">
                        <div>
                          <div className="flex gap-1 justify-center">
                            {[1,2,3,4,5].map((s) => (
                              <span key={s} className={`w-4 h-4 rounded-sm ${s <= report.communicationHealth ? (isBad ? "bg-red-400" : isGood ? "bg-green-400" : "bg-yellow-400") : "bg-surface-border"}`} />
                            ))}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Saúde da Comunicação</p>
                        </div>
                        <div>
                          <div className="flex gap-1 justify-center">
                            {[1,2,3,4,5].map((s) => (
                              <span key={s} className={`w-4 h-4 rounded-sm ${s <= report.clientEngagement ? "bg-blue-400" : "bg-surface-border"}`} />
                            ))}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Engajamento do Cliente</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-green-400 font-medium mb-1">✅ Destaques</p>
                        <p className="text-gray-300 leading-relaxed">{report.highlights}</p>
                      </div>
                      <div>
                        <p className="text-xs text-red-400 font-medium mb-1">⚠️ Desafios</p>
                        <p className="text-gray-300 leading-relaxed">{report.challenges}</p>
                      </div>
                      <div>
                        <p className="text-xs text-blue-400 font-medium mb-1">🎯 Próximos Passos</p>
                        <p className="text-gray-300 leading-relaxed">{report.nextSteps}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeSection === "ltv" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-gray-400 text-sm">Análise de LTV e rentabilidade por cliente.</p>
              <div className="space-y-3">
                {mockClients
                  .sort((a, b) => b.monthlyBudget - a.monthlyBudget)
                  .map((client) => {
                    const monthsActive = Math.max(1, Math.floor(
                      (new Date().getTime() - new Date(client.joinDate).getTime()) / (1000 * 60 * 60 * 24 * 30)
                    ));
                    const ltv = client.monthlyBudget * monthsActive;
                    const percentage = (client.monthlyBudget / totalMRR) * 100;

                    return (
                      <div key={client.id} className="card">
                        <div className="flex items-center gap-4 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-brand/20 flex items-center justify-center font-bold text-brand-light">
                            {client.name[0]}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-white">{client.name}</span>
                              <span className="font-bold text-green-400">{formatCurrency(client.monthlyBudget)}/mês</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-400 mt-0.5">
                              <span>{monthsActive} meses ativo</span>
                              <span>LTV acumulado: <span className="text-blue-400 font-medium">{formatCurrency(ltv)}</span></span>
                              <span>{percentage.toFixed(1)}% do MRR</span>
                            </div>
                          </div>
                        </div>
                        <div className="h-2 bg-surface-border rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              client.status === "at_risk" ? "bg-red-400" :
                              client.status === "good" ? "bg-green-400" : "bg-brand"
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
