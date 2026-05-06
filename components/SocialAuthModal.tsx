"use client";

import { useState } from "react";
import { Zap, Lock, ChevronDown } from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";

export default function SocialAuthModal() {
  const { socialTeam, loginSocial } = useAppState();
  const [selectedName, setSelectedName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleLogin = () => {
    if (!selectedName || !password) return;
    const success = loginSocial(selectedName, password);
    if (!success) {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center mb-4">
            <Zap size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">LONE OS</h1>
          <p className="text-xs text-muted-foreground tracking-widest uppercase mt-1">Social Media</p>
        </div>

        {/* Login Card */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <Lock size={14} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground tracking-tight">Acesso Restrito</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Selecione seu nome e insira sua senha para acessar o workspace.
          </p>

          {/* Name selector */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5 uppercase tracking-wider">Colaborador</label>
            <div className="relative">
              <select
                value={selectedName}
                onChange={(e) => { setSelectedName(e.target.value); setPassword(""); setError(false); }}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer"
              >
                <option value="">Selecione seu nome...</option>
                {socialTeam.map((m) => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Welcome message */}
          {selectedName && (
            <p className="text-sm text-primary animate-fade-in">
              Que bom te ver aqui, <span className="font-semibold">{selectedName.split(" ")[0]}</span>!
            </p>
          )}

          {/* Password */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5 uppercase tracking-wider">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="••••"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 animate-fade-in">Senha incorreta. Tente novamente.</p>
          )}

          {/* Login button */}
          <button
            onClick={handleLogin}
            disabled={!selectedName || !password}
            className="w-full btn-primary py-2.5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Entrar
          </button>
        </div>

        <p className="text-muted-foreground/30 text-[10px] text-center mt-6 uppercase tracking-widest">
          Lone Mídia © 2026
        </p>
      </div>
    </div>
  );
}
