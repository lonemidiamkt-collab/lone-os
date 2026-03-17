"use client";

import { useState, useRef } from "react";
import {
  Upload, Calendar, FileText, User, Tag,
  Save, ImageIcon,
} from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import { getPriorityColor, getPriorityLabel } from "@/lib/utils";
import type { ContentCard } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

const STATUS_OPTIONS: { value: ContentCard["status"]; label: string; color: string }[] = [
  { value: "ideas", label: "Ideias", color: "bg-gray-400" },
  { value: "script", label: "Roteiro", color: "bg-purple-400" },
  { value: "in_production", label: "Em Produção", color: "bg-blue-400" },
  { value: "approval", label: "Aprovação", color: "bg-yellow-400" },
  { value: "scheduled", label: "Agendado", color: "bg-teal-400" },
  { value: "published", label: "Publicado", color: "bg-green-400" },
];

interface Props {
  card: ContentCard;
  onClose: () => void;
}

export default function ContentCardModal({ card, onClose }: Props) {
  const { updateContentCard } = useAppState();
  const [observations, setObservations] = useState(card.observations ?? "");
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [status, setStatus] = useState(card.status);
  const [imageUrl, setImageUrl] = useState(card.imageUrl ?? "");
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
  };

  const handleSave = () => {
    updateContentCard(card.id, { observations, dueDate: dueDate || undefined, status, imageUrl: imageUrl || undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="flex-row items-start px-6 py-5 border-b border-border shrink-0 space-y-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`w-2 h-2 rounded-full ${currentStatus?.color}`} />
              <span className="text-xs text-muted-foreground font-medium">{currentStatus?.label}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{card.format}</span>
              <span className="text-muted-foreground">·</span>
              <Badge className={`border text-xs ${getPriorityColor(card.priority)}`}>
                {getPriorityLabel(card.priority)}
              </Badge>
            </div>
            <DialogTitle className="text-lg leading-tight">{card.title}</DialogTitle>
            <p className="text-sm text-primary mt-0.5">{card.clientName}</p>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Art preview */}
          <div className="w-72 border-r border-border flex flex-col shrink-0">
            <div className="flex-1 relative bg-muted overflow-hidden">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Arte do conteúdo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <ImageIcon size={40} />
                  <p className="text-xs text-center px-4">Nenhuma arte anexada ainda</p>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-border">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2"
              >
                <Upload size={13} />
                {imageUrl ? "Trocar arquivo" : "Anexar arte / arquivo"}
              </Button>
            </div>
          </div>

          {/* Right: Details */}
          <div className="flex-1 overflow-auto p-6 space-y-5">
            {/* Meta info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <User size={12} />
                <span>{card.socialMedia}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Tag size={12} />
                <span>{card.format}</span>
              </div>
            </div>

            {/* Status selector */}
            <div>
              <Label className="block mb-2">Status</Label>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStatus(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      status === opt.value
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${opt.color}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Posting date */}
            <div>
              <Label className="flex items-center gap-1.5 mb-2">
                <Calendar size={12} />
                Data de Postagem
              </Label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Briefing */}
            {card.briefing && (
              <div>
                <Label className="flex items-center gap-1.5 mb-2">
                  <FileText size={12} />
                  Briefing
                </Label>
                <div className="bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground leading-relaxed">
                  {card.briefing}
                </div>
              </div>
            )}

            {/* Observations */}
            <div>
              <Label className="block mb-2">Observações / Notas</Label>
              <Textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                rows={4}
                placeholder="Adicione observações, feedbacks, ajustes necessários..."
              />
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={handleSave}
            className={`flex items-center gap-2 ${saved ? "bg-green-600 hover:bg-green-600" : ""}`}
          >
            <Save size={14} />
            {saved ? "Salvo!" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
