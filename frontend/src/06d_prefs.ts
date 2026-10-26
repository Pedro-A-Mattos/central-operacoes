// Preferências de tela: escolhas de lista fechada que o operador refaria a cada visita (desenho da tabela por data,
// ordem das linhas, agrupamento dos entregadores, cor do mapa, funil aberto ou fechado).
// NÃO são dados: nenhuma planilha, cidade, entregador, data ou filtro é guardado. Ficam no localStorage deste navegador;
// se ele estiver bloqueado, tudo continua funcionando, só sem lembrar.

const PREFS_CHAVE = "cio:prefs:v1";
let prefsSalvas = "";

// O "desenho": como a tabela por data e a tela de entregadores estão montadas. Não é filtro: sobrevive a uma nova importação
// (que zera os filtros) e à próxima visita.
interface Layout { pivot: { dims: DimPivot[]; ordem: string }; pivotEntrega: { dims: DimPivot[]; ordem: string }; entregadores: "entregador" | "cidade" }

function layoutAtual(): Layout {
  const pv = (p: EstadoPivot) => ({ dims: [...p.dims], ordem: p.ordem === "total" ? "total" : "nome" }); // ordem por data não vale para outro relatório
  return { pivot: pv(E.f.pivot), pivotEntrega: pv(E.f.pivotEntrega), entregadores: E.f.entregadores.agrupar };
}

// Aplica um desenho (do navegador ou da tela anterior). Valor desconhecido ou fora da lista é ignorado: nunca quebra a tela.
function restaurarLayout(l: any) {
  if (!l || typeof l !== "object") return;
  const ids = DIMS_PIVOT.map((d) => d.id);
  const dimsValidas = (v: unknown): DimPivot[] | null => (Array.isArray(v) && v.length > 0 && v.every((x) => ids.includes(x)) ? ids.filter((id) => v.includes(id)) : null); // sempre na ordem da hierarquia
  const aplicarPivot = (est: EstadoPivot, q: any) => {
    if (!q || typeof q !== "object") return;
    const d = dimsValidas(q.dims); if (d) est.dims = d;
    if (q.ordem === "nome" || q.ordem === "total") est.ordem = q.ordem;
  };
  aplicarPivot(E.f.pivot, l.pivot); aplicarPivot(E.f.pivotEntrega, l.pivotEntrega);
  if (l.entregadores === "entregador" || l.entregadores === "cidade") E.f.entregadores.agrupar = l.entregadores;
}

function prefsAtuais() {
  return { ...layoutAtual(), mapaCor: E.mapa.cor, funil: Object.fromEntries(FUNIL_ABERTO) };
}

// Chamada a cada desenho da tela: só escreve quando algo mudou.
function salvarPrefs() {
  try {
    const s = JSON.stringify(prefsAtuais());
    if (s === prefsSalvas) return;
    prefsSalvas = s; localStorage.setItem(PREFS_CHAVE, s);
  } catch { /* armazenamento bloqueado: não lembra, o resto segue */ }
}

// Chamada uma vez, antes do primeiro desenho.
function aplicarPrefs() {
  let p: any;
  try { p = JSON.parse(localStorage.getItem(PREFS_CHAVE) || "null"); } catch { return; }
  if (!p || typeof p !== "object") return;
  restaurarLayout(p);
  if (p.mapaCor === "situacao" || p.mapaCor === "espera" || p.mapaCor === "rota") E.mapa.cor = p.mapaCor;
  if (p.funil && typeof p.funil === "object") for (const [k, v] of Object.entries(p.funil)) if (typeof v === "boolean") FUNIL_ABERTO.set(k, v);
  prefsSalvas = JSON.stringify(prefsAtuais());
}

// "Esquecer": apaga o que foi guardado e volta o desenho ao padrão.
function esquecerPrefs() {
  try { localStorage.removeItem(PREFS_CHAVE); } catch { /* nada a apagar */ }
  const padrao = filtrosVazios();
  Object.assign(E.f.pivot, { dims: padrao.pivot.dims, ordem: "nome" }); Object.assign(E.f.pivotEntrega, { dims: padrao.pivotEntrega.dims, ordem: "nome" });
  E.f.entregadores.agrupar = "entregador"; E.mapa.cor = "situacao"; FUNIL_ABERTO.clear(); prefsSalvas = "";
}
