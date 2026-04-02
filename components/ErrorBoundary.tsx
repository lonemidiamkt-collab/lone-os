"use client";

import { Component, type ReactNode } from "react";
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

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[300px] p-8">
          <div className="text-center space-y-4 max-w-sm">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Algo deu errado</h3>
              <p className="text-xs text-zinc-500 mt-1">
                {this.state.error?.message ?? "Erro inesperado. Tente recarregar."}
              </p>
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0a34f5] text-white text-xs font-medium hover:bg-[#0c3cff] transition-colors shadow-[0_0_15px_rgba(10,52,245,0.2)]"
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
