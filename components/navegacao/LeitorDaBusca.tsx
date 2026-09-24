"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

// A query da URL (?view=agenda, ?filter=at_risk) decide qual subtela acende no menu. useSearchParams
// exige um Suspense em volta no prerender do Next; isolado aqui, só este pedaço suspende — a barra
// lateral e a barra do celular renderizam normalmente e recebem a query quando ela chega.
function Leitor({ onChange }: { onChange: (busca: string) => void }) {
  const params = useSearchParams();
  const busca = params?.toString() ?? "";
  useEffect(() => { onChange(busca); }, [busca, onChange]);
  return null;
}

export default function LeitorDaBusca({ onChange }: { onChange: (busca: string) => void }) {
  return (
    <Suspense fallback={null}>
      <Leitor onChange={onChange} />
    </Suspense>
  );
}
