"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ContentCard } from "@/lib/types";
import { snakeToContentCard } from "@/lib/supabase/queries";

interface RealtimeHandlers {
  onInsert?: (card: ContentCard) => void;
  onUpdate?: (card: ContentCard) => void;
  onDelete?: (id: string) => void;
}

/**
 * Subscribe a Supabase Realtime pra mudanças em `content_cards`.
 * Dispara handlers quando outro client (qualquer aba/dispositivo) faz INSERT/UPDATE/DELETE.
 *
 * Importante: o canal é compartilhado entre instâncias do hook na mesma aba.
 * Mudanças locais (do mesmo browser) também disparam — caller deve fazer dedupe
 * via id (state já tem o card → não re-aplica).
 */
export function useRealtimeContentCards(handlers: RealtimeHandlers) {
  useEffect(() => {
    const channel = supabase
      .channel("public:content_cards")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "content_cards" },
        (payload) => {
          if (handlers.onInsert && payload.new) {
            try {
              const card = snakeToContentCard(payload.new as Record<string, unknown>);
              handlers.onInsert(card);
            } catch (err) {
              console.error("[realtime] onInsert mapping error:", err);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "content_cards" },
        (payload) => {
          if (handlers.onUpdate && payload.new) {
            try {
              const card = snakeToContentCard(payload.new as Record<string, unknown>);
              handlers.onUpdate(card);
            } catch (err) {
              console.error("[realtime] onUpdate mapping error:", err);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "content_cards" },
        (payload) => {
          if (handlers.onDelete && payload.old) {
            const id = (payload.old as { id?: string }).id;
            if (id) handlers.onDelete(id);
          }
        },
      )
      .subscribe((status, err) => {
        if (err) console.error("[realtime] subscribe error:", err);
        if (status === "SUBSCRIBED") {
          console.log("[realtime] content_cards subscribed");
        }
      });

    return () => {
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
