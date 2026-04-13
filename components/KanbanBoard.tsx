"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Plus, Trash2, Edit3, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface KanbanColumn<T = unknown> {
  id: string;
  title: string;
  color: string;
  items: T[];
}

interface KanbanBoardProps<T extends { id: string }> {
  columns: KanbanColumn<T>[];
  renderCard: (item: T, columnId: string) => React.ReactNode;
  onMove?: (itemId: string, fromColumn: string, toColumn: string) => void;
  onDelete?: (itemId: string) => void;
  onEdit?: (item: T) => void;
  onAdd?: (columnId: string) => void;
}

export default function KanbanBoard<T extends { id: string }>({
  columns: propColumns,
  renderCard,
  onMove,
  onDelete,
  onEdit,
  onAdd,
}: KanbanBoardProps<T>) {
  const [columns, setColumns] = useState(propColumns);
  const [dragging, setDragging] = useState<{ itemId: string; fromCol: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!dragging) setColumns(propColumns);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propColumns, dragging]);

  const handleDragStart = (itemId: string, fromCol: string) => {
    setDragging({ itemId, fromCol });
  };

  const handleDrop = (toCol: string) => {
    if (!dragging || dragging.fromCol === toCol) {
      setDragging(null);
      setDragOver(null);
      return;
    }
    const fromColumn = columns.find((c) => c.id === dragging.fromCol);
    const toColumn = columns.find((c) => c.id === toCol);
    if (!fromColumn || !toColumn) return;
    const item = fromColumn.items.find((i: T) => i.id === dragging.itemId);
    if (!item) return;
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id === dragging.fromCol) return { ...col, items: col.items.filter((i: T) => i.id !== dragging.itemId) };
        if (col.id === toCol) return { ...col, items: [...col.items, item] };
        return col;
      })
    );
    onMove?.(dragging.itemId, dragging.fromCol, toCol);
    setDragging(null);
    setDragOver(null);
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div
          key={col.id}
          className={cn(
            "flex flex-col w-72 shrink-0 rounded-xl border transition-colors",
            dragOver === col.id ? "border-primary/50 bg-primary/5" : "border-border bg-card"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(col.id); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={() => handleDrop(col.id)}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className={cn("w-2.5 h-2.5 rounded-full", col.color)} />
              <span className="text-sm font-semibold text-foreground">{col.title}</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                {col.items.length}
              </span>
            </div>
            {onAdd && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onAdd(col.id)}>
                <Plus size={14} className="text-muted-foreground" />
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2 p-3 min-h-[100px]">
            {col.items.map((item: T) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(item.id, col.id)}
                className={cn(
                  "cursor-grab active:cursor-grabbing transition-opacity relative group",
                  dragging?.itemId === item.id ? "opacity-40" : "opacity-100"
                )}
              >
                {renderCard(item, col.id)}

                {/* Context menu (3 dots) — appears on hover */}
                {(onEdit || onDelete) && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === item.id ? null : item.id); }}
                      className="w-6 h-6 rounded-md flex items-center justify-center bg-black/60 backdrop-blur-sm text-zinc-400 hover:text-white transition-all"
                    >
                      <MoreHorizontal size={12} />
                    </button>

                    {menuOpen === item.id && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(null)} />
                        <div className="absolute right-0 top-full mt-1 bg-[#0a0a0e] border border-white/[0.08] rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.5)] z-30 py-1 min-w-[120px] animate-fade-in">
                          {onEdit && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onEdit(item); setMenuOpen(null); }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.04] hover:text-white transition-all"
                            >
                              <Edit3 size={11} /> Editar
                            </button>
                          )}
                          {onDelete && (
                            confirmDelete === item.id ? (
                              <div className="px-3 py-1.5 flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); onDelete(item.id); setConfirmDelete(null); setMenuOpen(null); }}
                                  className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25"
                                >
                                  Confirmar
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                                  className="text-[10px] px-2 py-0.5 text-zinc-500 hover:text-white"
                                >
                                  Nao
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDelete(item.id); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/[0.06] transition-all"
                              >
                                <Trash2 size={11} /> Excluir
                              </button>
                            )
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            {col.items.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs border-2 border-dashed border-border rounded-lg py-8">
                Sem itens
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
