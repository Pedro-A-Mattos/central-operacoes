// Estado da aplicação e navegação. Um único objeto, alterado por `atualizar`,
// seguido de nova renderização. Filtros são LOCAIS por tela (como no MVP).

type Tela = "importar" | "torre" | "piso" | "excecoes" | "pendencias" | "entregadores" | "historico" | "mapa" | "a-entregar" | "mudancas" | "fora" | "regras" | "criterios";

interface SelecaoGrafico { dim: "cidade" | "entregador" | "faixa" | "problema" | "classe" | "rota"; valor: string; rotulo: string }

interface FiltrosPend { cidades: string[]; classes: string[]; faixas: string[]; rota: string[]; dias: string[]; soProblema: boolean; semEntregador: boolean; sel: SelecaoGrafico | null }
interface FiltrosPiso { tipos: string[]; cidades: string[]; entregadores: string[]; vista?: "tabela" | "roteiro" }
interface FiltrosExc { aba: TipoExcecao | "justificados"; cidades: string[]; entregadores: string[] }
interface FiltrosEnt { dias: string[]; ordem: "total" | "pct_desc" | "pct_asc" | "anormal" | "pendente" | "rua"; sel: { entregador: string; classe: string | null } | null; realce: string | null }

type RefAwb =
  | { fonte: "atual"; reg: RegAtual }
  | { fonte: "saiu"; reg: RegSaiu }
  | { fonte: "fora_atual" | "fora_base"; dados: Dados };

const filtrosVazios = () => ({
  pendencias: { cidades: [], classes: [], faixas: [], rota: [], dias: [], soProblema: false, semEntregador: false, sel: null } as FiltrosPend,
  piso: { tipos: [], cidades: [], entregadores: [] } as FiltrosPiso,
  excecoes: { aba: "devolucao", cidades: [], entregadores: [] } as FiltrosExc,
  entregadores: { dias: [], ordem: "total", sel: null, realce: null } as FiltrosEnt,
  aEntregar: { cidade: "", entregador: "" },
  mudancas: { aba: "provavel_entrega" as "provavel_entrega" | "possivel_devolucao" | "novas" | "status" },
  fora: { aba: "atual" as "atual" | "base" },
});

const E = {
  servico: null as Servico | null,
  iniciando: true,
  tela: "importar" as Tela,
  analise: null as Analise | null,
  idx: new Map<string, RefAwb>(),
  desempenho: null as Desempenho | null,
  carregandoDesempenho: false,
  imp: {
    base: null as ValidacaoArquivo | null, atual: null as ValidacaoArquivo | null,
    lendo: { base: false, atual: false }, erro: { base: null as ProblemaArquivo | null, atual: null as ProblemaArquivo | null },
    ordem: null as Analise["ordem"] | null, processando: false, etapas: [] as { texto: string; feito: boolean }[],
    erroGeral: null as ProblemaArquivo | null,
    editandoRef: false,
  },
  params: { ignorar_descarregado: true, ignorar_nao_recebido: true, limiar_ruido: 3, cidades_ignoradas: [], referencia_backlog: null } as ParametrosAnalise,
  f: filtrosVazios(),
  drawer: null as string | null,
  drawerFoco: "" as "" | "justificar",
  origem: null as { tela: Tela; rotulo: string } | null,
  menuAberto: false,
  exemplo: false,
  historico: [] as RegistroImportacao[],
  mapa: { cidade: "", cor: "situacao" as "situacao" | "espera" | "rota", modo: "mapa" as "mapa" | "esquema" },
  overrides: { por_cidade: {}, cidades_ignoradas: [] } as Overrides,
};

let renderizar: () => void = () => {};
function atualizar(fn?: () => void) { if (fn) fn(); renderizar(); }

const TITULOS: Record<Tela, string> = {
  importar: "Nova importação", torre: "Torre de controle", piso: "Conferência de piso", excecoes: "Exceções",
  pendencias: "Pendências", entregadores: "Entregadores", historico: "Histórico", mapa: "Mapa", "a-entregar": "Encomendas a entregar", mudancas: "O que mudou",
  fora: "Fora da jurisdição", regras: "Regras de abrangência", criterios: "Importação e critérios",
};

function navegar(tela: Tela, opts: { prep?: () => void; de?: Tela } = {}) {
  atualizar(() => {
    if (opts.de) E.origem = { tela: opts.de, rotulo: TITULOS[opts.de] }; else E.origem = null;
    E.tela = tela; E.menuAberto = false; AJUDA.aberta = "";
    if (opts.prep) opts.prep();
  });
  try { history.replaceState(null, "", "#" + tela); } catch { /* sem histórico */ }
  const main = document.getElementById("conteudo"); if (main) main.scrollTop = 0;
  window.scrollTo(0, 0);
  const t = document.getElementById("titulo-tela"); if (t) t.focus({ preventScroll: true });
}

function indexar(a: Analise) {
  const idx = new Map<string, RefAwb>();
  for (const d of a.fora.base) idx.set(String(d["Waybill No"]), { fonte: "fora_base", dados: d });
  for (const r of a.sairam) idx.set(String(r.dados["Waybill No"]), { fonte: "saiu", reg: r });
  for (const d of a.fora.atual) idx.set(String(d["Waybill No"]), { fonte: "fora_atual", dados: d });
  for (const r of a.atual) idx.set(String(r.dados["Waybill No"]), { fonte: "atual", reg: r });
  E.idx = idx;
}

// ---------- recortes derivados ----------
const awbDe = (d: Dados) => String(d["Waybill No"]);
const justificada = (awb: string) => !!E.analise && !!E.analise.justificativas[awb];
const excAtivas = (t: TipoExcecao) => (E.analise ? E.analise.atual.filter((r) => r.excecoes.includes(t) && !justificada(awbDe(r.dados))) : []);
const excJustificadas = () => (E.analise ? E.analise.atual.filter((r) => r.excecoes.length && justificada(awbDe(r.dados))) : []);
const errosPiso = () => (E.analise ? E.analise.atual.filter((r) => r.erro_piso) : []);

function contar<T>(itens: T[], chave: (x: T) => string | null): { rotulo: string; valor: number }[] {
  const m = new Map<string, number>();
  for (const i of itens) { const k = chave(i); if (k === null) continue; m.set(k, (m.get(k) || 0) + 1); }
  return [...m].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor || (a.rotulo < b.rotulo ? -1 : 1));
}
const unicos = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "pt-BR"));
// Tempo em rota = desde a saída para entrega (Delivery Time) até a referência.
const FAIXAS_ROTA = ["Menos de 12 h", "12 a 24 h", "Mais de 24 h", "Sem saída registrada"];
const TOM_ROTA: Record<string, Tom> = { "Menos de 12 h": "ok", "12 a 24 h": "atencao", "Mais de 24 h": "critico", "Sem saída registrada": "neutro" };
function faixaRota(r: RegAtual): string | null {
  if (r.entrega_confirmada) return null;
  const m = r.em_rota_min;
  return m === null ? "Sem saída registrada" : m < 720 ? "Menos de 12 h" : m < 1440 ? "12 a 24 h" : "Mais de 24 h";
}
const entregadorDe = (d: Dados) => (d["Delivery Associate"] === null || d["Delivery Associate"] === undefined ? "(sem entregador)" : String(d["Delivery Associate"]));
