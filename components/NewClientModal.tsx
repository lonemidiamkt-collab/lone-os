"use client";

import { useState, useEffect } from "react";
import { UserPlus, Building2, Users, Facebook, Link2, ChevronDown, Check, Loader2, Unlink, ExternalLink } from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import { useMetaConnection, fetchAdAccounts } from "@/lib/meta/useMetaAds";
import type { Client } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TEAM_MEMBERS = {
  traffic: ["Ana Lima", "Pedro Alves"],
  social: ["Carlos Melo", "Mariana Costa"],
  designer: ["Rafael Designer"],
};

const INDUSTRIES = [
  "Tecnologia", "Saúde", "Imobiliário", "Fitness", "Gastronomia",
  "Educação", "E-commerce", "Moda", "Beleza", "Jurídico",
  "Financeiro", "Construção", "Varejo", "Serviços", "Outro",
];

interface AdAccount {
  id: string;
  name: string;
  account_id: string;
  currency?: string;
  account_status?: number;
}

interface Props {
  onClose: () => void;
  onSuccess: (clientId: string) => void;
}

export default function NewClientModal({ onClose, onSuccess }: Props) {
  const { addClient } = useAppState();
  const meta = useMetaConnection();
  const [form, setForm] = useState({
    name: "",
    industry: "Tecnologia",
    paymentMethod: "pix" as Client["paymentMethod"],
    assignedTraffic: TEAM_MEMBERS.traffic[0],
    assignedSocial: TEAM_MEMBERS.social[0],
    assignedDesigner: TEAM_MEMBERS.designer[0],
    notes: "",
  });
  const [error, setError] = useState("");

  // Meta ad accounts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedAdAccount, setSelectedAdAccount] = useState<any>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");

  // Fetch ad accounts when meta is connected
  useEffect(() => {
    if (meta.connected && meta.token) {
      setLoadingAccounts(true);
      fetchAdAccounts(meta.token)
        .then((accounts: any[]) => {
          setAdAccounts(accounts ?? []);
        })
        .catch(() => setAdAccounts([]))
        .finally(() => setLoadingAccounts(false));
    }
  }, [meta.connected, meta.token]);

  const filteredAccounts = accountSearch
    ? adAccounts.filter((a: any) =>
        a.name?.toLowerCase().includes(accountSearch.toLowerCase()) ||
        a.account_id?.includes(accountSearch)
      )
    : adAccounts;

  const set = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    if (!form.name.trim()) { setError("Nome do cliente é obrigatório."); return; }

    const newClient = addClient({
      name: form.name.trim(),
      industry: form.industry,
      monthlyBudget: 0,
      paymentMethod: form.paymentMethod,
      assignedTraffic: form.assignedTraffic,
      assignedSocial: form.assignedSocial,
      assignedDesigner: form.assignedDesigner,
      notes: form.notes || undefined,
      metaAdAccountId: selectedAdAccount?.id,
      metaAdAccountName: selectedAdAccount?.name,
    });

    onSuccess(newClient.id);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
              <UserPlus size={18} className="text-primary" />
            </div>
            <div>
              <DialogTitle>Adicionar Novo Cliente</DialogTitle>
              <DialogDescription>Onboarding será gerado automaticamente</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {error && (
            <p className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2.5">
              {error}
            </p>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="client-name">
              Nome do Cliente <span className="text-destructive">*</span>
            </Label>
            <Input
              id="client-name"
              value={form.name}
              onChange={(e) => { set("name", e.target.value); setError(""); }}
              placeholder="Ex: TechStart Soluções Ltda"
            />
          </div>

          {/* Industry + Payment */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Building2 size={12} /> Segmento
              </Label>
              <Select value={form.industry} onValueChange={(v) => set("industry", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((i) => (
                    <SelectItem key={i} value={i}>{i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Forma de Pagamento</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => set("paymentMethod", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">Pix</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="cartao">Cartão</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Responsibles */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Users size={12} /> Gestor de Tráfego
              </Label>
              <Select value={form.assignedTraffic} onValueChange={(v) => set("assignedTraffic", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_MEMBERS.traffic.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Users size={12} /> Social Media
              </Label>
              <Select value={form.assignedSocial} onValueChange={(v) => set("assignedSocial", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_MEMBERS.social.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Users size={12} /> Designer
              </Label>
              <Select value={form.assignedDesigner} onValueChange={(v) => set("assignedDesigner", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_MEMBERS.designer.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ═══ META AD ACCOUNT LINK ═══ */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Facebook size={12} /> Conta de Anúncio (Meta Ads)
            </Label>

            {!meta.connected ? (
              /* Not connected to Meta */
              <button
                type="button"
                onClick={meta.connect}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-dashed border-[#2a2a2a] bg-[#0a0a0a] hover:border-[#0a34f5]/30 hover:bg-[#0a34f5]/[0.02] transition-all text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-[#1877F2]/10 flex items-center justify-center shrink-0">
                  <Facebook size={16} className="text-[#1877F2]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-zinc-400 font-medium group-hover:text-white transition-colors">
                    Conectar ao Facebook
                  </p>
                  <p className="text-[10px] text-zinc-700">
                    Vincule para acessar as campanhas do cliente
                  </p>
                </div>
                <ExternalLink size={14} className="text-zinc-700 group-hover:text-[#0a34f5] transition-colors" />
              </button>
            ) : selectedAdAccount ? (
              /* Account selected */
              <div className="flex items-center gap-3 p-3.5 rounded-xl border border-[#0a34f5]/20 bg-[#0a34f5]/[0.03]">
                <div className="w-9 h-9 rounded-lg bg-[#0a34f5]/10 border border-[#0a34f5]/20 flex items-center justify-center shrink-0">
                  <Link2 size={16} className="text-[#0a34f5]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{selectedAdAccount.name}</p>
                  <p className="text-[10px] text-zinc-500">ID: {selectedAdAccount.account_id} {selectedAdAccount.currency && `· ${selectedAdAccount.currency}`}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedAdAccount(null); setShowAccountPicker(false); }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                  title="Desvincular"
                >
                  <Unlink size={14} />
                </button>
              </div>
            ) : (
              /* Connected but no account selected — show picker */
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAccountPicker(!showAccountPicker)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border bg-[#0a0a0a] text-left transition-all ${
                    showAccountPicker
                      ? "border-[#0a34f5] shadow-[0_0_0_3px_rgba(10,52,245,0.1)]"
                      : "border-[#1a1a1a] hover:border-[#2a2a2a]"
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg bg-[#1877F2]/10 flex items-center justify-center shrink-0">
                    {loadingAccounts ? (
                      <Loader2 size={16} className="text-[#1877F2] animate-spin" />
                    ) : (
                      <Facebook size={16} className="text-[#1877F2]" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-zinc-500">
                      {loadingAccounts ? "Carregando contas..." : "Selecionar conta de anúncio"}
                    </p>
                    <p className="text-[10px] text-zinc-700">
                      {adAccounts.length > 0 ? `${adAccounts.length} conta(s) disponível(eis)` : loadingAccounts ? "" : "Nenhuma conta encontrada"}
                    </p>
                  </div>
                  <ChevronDown size={16} className={`text-zinc-600 transition-transform ${showAccountPicker ? "rotate-180" : ""}`} />
                </button>

                {/* Account dropdown */}
                {showAccountPicker && adAccounts.length > 0 && (
                  <div className="absolute top-full mt-2 left-0 right-0 bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] z-50 animate-fade-in overflow-hidden">
                    {/* Search */}
                    {adAccounts.length > 5 && (
                      <div className="p-2 border-b border-[#1a1a1a]">
                        <input
                          type="text"
                          value={accountSearch}
                          onChange={(e) => setAccountSearch(e.target.value)}
                          placeholder="Buscar conta..."
                          className="w-full bg-[#121212] border border-[#1a1a1a] rounded-lg px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-700 focus:border-[#0a34f5]/50"
                        />
                      </div>
                    )}
                    <div className="max-h-52 overflow-y-auto py-1">
                      {filteredAccounts.map((account: any) => (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => {
                            setSelectedAdAccount(account);
                            setShowAccountPicker(false);
                            setAccountSearch("");
                          }}
                          className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-all hover:bg-[#0a34f5]/5"
                        >
                          <div className="w-7 h-7 rounded-md bg-[#121212] border border-[#2a2a2a] flex items-center justify-center shrink-0">
                            <Facebook size={12} className="text-[#1877F2]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{account.name}</p>
                            <p className="text-[10px] text-zinc-600">
                              {account.account_id} {account.currency && `· ${account.currency}`}
                              {account.account_status === 2 && " · Desativada"}
                            </p>
                          </div>
                          {selectedAdAccount?.id === account.id && (
                            <Check size={14} className="text-[#0a34f5] shrink-0" />
                          )}
                        </button>
                      ))}
                      {filteredAccounts.length === 0 && (
                        <p className="text-xs text-zinc-600 text-center py-4">Nenhuma conta encontrada</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">
              Observações Internas <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              placeholder="Contexto inicial sobre o cliente, expectativas, particularidades..."
            />
          </div>

          {/* Info banner */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 text-xs text-primary">
            Ao salvar, o checklist de onboarding padrão (9 itens) será gerado automaticamente
            e uma entrada será criada no histórico operacional do cliente.
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} className="flex items-center gap-2">
            <UserPlus size={14} />
            Cadastrar Cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
