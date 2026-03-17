"use client";

import { useState } from "react";
import { UserPlus, DollarSign, Building2, Users } from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
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
};

const INDUSTRIES = [
  "Tecnologia", "Saúde", "Imobiliário", "Fitness", "Gastronomia",
  "Educação", "E-commerce", "Moda", "Beleza", "Jurídico",
  "Financeiro", "Construção", "Varejo", "Serviços", "Outro",
];

interface Props {
  onClose: () => void;
  onSuccess: (clientId: string) => void;
}

export default function NewClientModal({ onClose, onSuccess }: Props) {
  const { addClient } = useAppState();
  const [form, setForm] = useState({
    name: "",
    industry: "Tecnologia",
    monthlyBudget: "",
    paymentMethod: "pix" as Client["paymentMethod"],
    assignedTraffic: TEAM_MEMBERS.traffic[0],
    assignedSocial: TEAM_MEMBERS.social[0],
    notes: "",
  });
  const [error, setError] = useState("");

  const set = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    if (!form.name.trim()) { setError("Nome do cliente é obrigatório."); return; }
    const budget = parseFloat(form.monthlyBudget);
    if (!budget || budget <= 0) { setError("Informe um investimento mensal válido."); return; }

    const newClient = addClient({
      name: form.name.trim(),
      industry: form.industry,
      monthlyBudget: budget,
      paymentMethod: form.paymentMethod,
      assignedTraffic: form.assignedTraffic,
      assignedSocial: form.assignedSocial,
      notes: form.notes || undefined,
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

          {/* Budget */}
          <div className="space-y-1.5">
            <Label htmlFor="budget" className="flex items-center gap-1.5">
              <DollarSign size={12} /> Investimento Mensal (R$) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="budget"
              type="number"
              min="0"
              step="100"
              value={form.monthlyBudget}
              onChange={(e) => { set("monthlyBudget", e.target.value); setError(""); }}
              placeholder="Ex: 5000"
            />
          </div>

          {/* Responsibles */}
          <div className="grid grid-cols-2 gap-4">
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
