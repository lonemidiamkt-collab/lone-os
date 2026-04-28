"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  /** Identificador opcional pra contexto (ex.: "Kanban Designer", "Modal Card"). */
  context?: string;
  children: React.ReactNode;
  /** Fallback custom. Se omitido, usa o card de erro padrão. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Boundary genérico pra envolver áreas críticas (kanban, modais).
 * Se algum filho jogar uma exception durante render, mostra o fallback
 * em vez de derrubar a página inteira.
 *
 * Uso:
 *   <KanbanErrorBoundary context="Designer Kanban"><KanbanBoard ... /></KanbanErrorBoundary>
 */
export default class KanbanErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.context ? ` · ${this.props.context}` : ""}]`, error, info.componentStack);
    // Aqui dá pra plugar Sentry/Logflare etc no futuro
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-6 m-3 flex items-start gap-3 animate-fade-in">
        <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Erro ao carregar este componente</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {this.props.context ? `(${this.props.context}) ` : ""}
            Algo deu errado ao renderizar. O resto do app continua funcionando.
          </p>
          {process.env.NODE_ENV !== "production" && (
            <pre className="text-[10px] text-red-300/70 mt-2 overflow-auto max-h-32 bg-black/40 rounded p-2 whitespace-pre-wrap break-all">
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={this.reset}
            className="mt-3 text-xs px-3 py-1.5 rounded-md bg-[#0d4af5] hover:bg-[#1a56ff] text-white font-medium transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }
}
