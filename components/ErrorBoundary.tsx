"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  // Erro de RENDER de uma página inteira (AppShell) não passa pelo window.onerror — ficava só no
  // console da pessoa. Manda para a trilha do servidor (18/09).
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary · app]", error, info.componentStack);
    import("@/lib/supabase/authed-fetch").then(({ authedFetch }) => authedFetch("/api/system/erro-cliente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msg: `[render · app] ${error.message}`, stack: `${error.stack ?? ""}\n--- componente ---${(info.componentStack ?? "").slice(0, 800)}`, url: location.pathname, acao: "error-boundary" }) }).catch(() => {})).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[300px] p-8">
          <div className="text-center space-y-4 max-w-sm">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
              <AlertTriangle size={20} className="text-destructive" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Algo deu errado</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {this.state.error?.message ?? "Erro inesperado. Tente recarregar."}
              </p>
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary transition-colors"
            >
              <RefreshCw size={12} />
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
