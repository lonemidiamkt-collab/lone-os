"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Plus } from "lucide-react";
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
}

export default function KanbanBoard<T extends { id: string }>({
  columns: propColumns,
  renderCard,
  onMove,
}: KanbanBoardProps<T>) {
  const [columns, setColumns] = useState(propColumns);
  const [dragging, setDragging] = useState<{ itemId: string; fromCol: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Sync columns from props when not dragging
  useEffect(() => {
    if (!dragging) {
      setColumns(propColumns);
    }
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
        if (col.id === dragging.fromCol) {
          return { ...col, items: col.items.filter((i: T) => i.id !== dragging.itemId) };
        }
        if (col.id === toCol) {
          return { ...col, items: [...col.items, item] };
        }
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
            dragOver === col.id
              ? "border-primary/50 bg-primary/5"
              : "border-border bg-card"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(col.id); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={() => handleDrop(col.id)}
        >
          {/* Column Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className={cn("w-2.5 h-2.5 rounded-full", col.color)} />
              <span className="text-sm font-semibold text-foreground">{col.title}</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                {col.items.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Plus size={14} className="text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal size={14} className="text-muted-foreground" />
              </Button>
            </div>
          </div>

          {/* Cards */}
          <div className="flex flex-col gap-2 p-3 min-h-[100px]">
            {col.items.map((item: T) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(item.id, col.id)}
                className={cn(
                  "cursor-grab active:cursor-grabbing transition-opacity",
                  dragging?.itemId === item.id ? "opacity-40" : "opacity-100"
                )}
              >
                {renderCard(item, col.id)}
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
