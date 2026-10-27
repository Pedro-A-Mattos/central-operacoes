// Estado da aplicação e navegação. Um único objeto, alterado por `atualizar`,
// seguido de nova renderização. Filtros são LOCAIS por tela (como no MVP).

type Tela = "importar" | "torre" | "piso" | "excecoes" | "pendencias" | "entregadores" | "historico" | "mapa" | "a-entregar" | "mudancas" | "fora" | "regras" | "criterios" | "nao-recebido" | "estudo";

interface SelecaoGrafico { dim: "cidade" | "entregador" | "problema" | "classe" | "rota"; valor: string; rotulo: string }

interface FiltrosPend { ocorrencia: "" | "vigente" | "tratada"; cidades: string[]; bairros: string[]; classes: string[]; rota: string[]; dias: string[]; soProblema: boolean; semEntregador: boolean; sel: SelecaoGrafico | null }
interface FiltrosPiso { tipos: string[]; cidades: string[]; bairros: string[]; entregadores: string[]; vista?: "tabela" | "roteiro" }
interface FiltrosExc { aba: AbaPend; cidades: string[]; bairros: string[]; entregadores: string[] }
// `agrupar`: "entregador" (uma linha por pessoa) ou "cidade" (cidade e, dentro dela, cada entregador). `sel.cidade` só existe no segundo.
interface FiltrosEnt { dias: string[]; ordem: "total" | "pct_desc" | "pct_asc" | "anormal" | "pendente" | "rua"; agrupar: "entregador" | "cidade"; sel: { entregador: string; cidade?: string; classe: string | null } | null; realce: string | null }

type RefAwb =
  | { fonte: "atual"; reg: RegAtual }
  | { fonte: "saiu"; reg: RegSaiu }
  | { fonte: "fora_atual" | "fora_base"; dados: Dados };

const pivotVazio = (): EstadoPivot => ({ dims: ["cidade"], datasFora: [], fechados: [], cel: null, ordem: "nome" });
const filtrosVazios = () => ({
  pendencias: { ocorrencia: "", cidades: [], bairros: [], classes: [], rota: [], dias: [], soProblema: false, semEntregador: false, sel: null } as FiltrosPend,
  pivot: pivotVazio(),         // tabela dinâmica da tela Pendências
  pivotEntrega: pivotVazio(),  // a da aba Pendentes de Pendências de entrega: estado próprio, para uma tela não mexer na outra
  piso: { tipos: [], cidades: [], bairros: [], entregadores: [] } as FiltrosPiso,
  excecoes: { aba: "atrasadas", cidades: [], bairros: [], entregadores: [] } as FiltrosExc,
  entregadores: { dias: [], ordem: "total", agrupar: "entregador", sel: null, realce: null } as FiltrosEnt,
  aEntregar: { cidade: "", entregador: "" },
  mudancas: { aba: "provavel_entrega" as "provavel_entrega" | "possivel_devolucao" | "ja_entregue" | "saiu_com_ocorrencia" | "novas" | "status" },
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
    modo: "completa" as "completa" | "piso1",
  },
  // Verdadeiro quando a análise atual veio do modo "conferir piso de 1 tabela"
  // (base == atual): só a Conferência de piso faz sentido.
  pisoUnico: false,
  params: { ignorar_descarregado: true, ignorar_nao_recebido: true, limiar_ruido: 3, cidades_ignoradas: [], referencia_backlog: null } as ParametrosAnalise,
  f: filtrosVazios(),
  drawer: null as string | null,
  drawerFoco: "" as "" | "justificar",
  origem: null as { tela: Tela; rotulo: string } | null,
  menuAberto: false,
  exemplo: false,
  historico: [] as RegistroImportacao[],
  mapa: { cidade: "", entregador: "", cor: "situacao" as "situacao" | "espera" | "rota", modo: "mapa" as "mapa" | "esquema", semCoordAberto: null as boolean | null },
  overrides: { por_cidade: {}, cidades_ignoradas: [] } as Overrides,
  estudo: {
    arquivo: null as ValidacaoArquivo | null, lendo: false, erro: null as ProblemaArquivo | null,
    limiar: 5, mapa: null as MapaRegiao | null, aplicado: null as { antes: number | null; depois: number | null; limiar: number } | null, processando: false, aba: "cep" as "cep" | "entregador",
  },
  // Mapa de região ATIVO usado pela Conferência de piso (null = regra derivada da base).
  // Padrão: regras_regiao.json publicado; a tela de Estudo pode substituir na sessão.
  mapaRegiaoAtivo: null as MapaRegiao | null,
  mapaRegiaoOrigem: "" as "" | "github" | "sessao",
};

let renderizar: () => void = () => {};
function atualizar(fn?: () => void) { if (fn) fn(); renderizar(); }

const TITULOS: Record<Tela, string> = {
  importar: "Nova importação", torre: "Torre de controle", piso: "Conferência de piso", excecoes: "Pendências de entrega",
  pendencias: "Pendências", entregadores: "Entregadores", historico: "Histórico", mapa: "Mapa", "a-entregar": "Encomendas a entregar", mudancas: "O que mudou",
  fora: "Fora da jurisdição", regras: "Regras de abrangência", criterios: "Importação e critérios",
  "nao-recebido": "Não recebido, mas entregue", estudo: "Estudo de regiões",
};

function navegar(tela: Tela, opts: { prep?: () => void; de?: Tela } = {}) {
  atualizar(() => {
    if (opts.de) E.origem = { tela: opts.de, rotulo: TITULOS[opts.de] }; else E.origem = null;
    E.tela = tela; E.menuAberto = false; AJUDA.aberta = "";
    if (opts.prep) {
      // Atalho vindo de outra tela (gráfico, alerta ou indicador): a tabela dinâmica de destino começa sem datas tiradas nem célula
      // selecionada. Senão o filtro de uma visita anterior continua valendo e o número não bate com o que foi clicado.
      // O desenho (dims, linhas recolhidas) é escolha do usuário e fica.
      const pv = tela === "pendencias" ? E.f.pivot : tela === "excecoes" ? E.f.pivotEntrega : null;
      if (pv) { pv.datasFora = []; pv.cel = null; }
      opts.prep();
    }
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

// ---------- Pendências de entrega: o que o coordenador precisa fazer ----------
// Regra do operador por número de tentativas: 1 → colocar em rota de novo; 2 → rota de
// novo e ver com o entregador se devolve; 3 → processo de devolução. Quem já saiu de
// novo para entrega depois da ocorrência (`reroteada`) sai das listas de ação.
// Avaria não é tentativa de entrega (a peça pode nem ter saído do galpão): tem lista própria, com o processo de
// avaria, e não entra nas de tentativas. Peça com 0 tentativas e outro problema também não é "1 tentativa".
type AcaoPend = "atrasadas" | "tent1" | "tent2" | "tent3" | "extravio" | "avaria" | "ja_em_rota";
type AbaPend = AcaoPend | "justificados";
const tentativasDe = (r: RegAtual) => Number(r.dados["Delivery Count"]) || 0;

// Regra de pendência (alinhada com a operação em 24/10/2026). É pendência:
//   · toda peça de uma cidade sem prazo (por padrão Unaí; configurável), qualquer que seja a data de chegada;
//   · nas demais cidades, a peça que chegou ANTES do dia da referência (prazo de um dia vencido).
// Não é pendência: peça das demais cidades que chegou no mesmo dia da referência; peça com entrega confirmada;
// peça com tentativa de entrega registrada no dia da referência (ela vai para as listas de tentativas).
// Sem data de chegada: conta como pendência, porque não dá para provar que chegou hoje.
// A lista de cidades sem prazo é configurável em Regras de abrangência (E.overrides.cidades_sem_prazo). Nunca definida: vale o
// padrão, Unaí. Lista vazia é uma escolha (nenhuma cidade com exceção).
const CIDADES_SEM_PRAZO_PADRAO = ["Unaí"];
const cidadesSemPrazo = (): string[] => E.overrides.cidades_sem_prazo ?? CIDADES_SEM_PRAZO_PADRAO;
const chaveCidade = (c: unknown) => normalizarBusca(String(c ?? ""));
let semPrazoEmCache: { lista: string[]; chaves: Set<string> } | null = null; // a lista só muda ao salvar: não normaliza a cada peça
function chavesSemPrazo(lista: string[] = cidadesSemPrazo()): Set<string> {
  if (!semPrazoEmCache || semPrazoEmCache.lista !== lista) semPrazoEmCache = { lista, chaves: new Set(lista.map(chaveCidade)) };
  return semPrazoEmCache.chaves;
}
const nomesJuntos = (l: string[]) => (l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " e " + l[l.length - 1]);
const refDiaAnalise = () => (E.analise ? E.analise.referencia_backlog.slice(0, 10) : "");
const ehCidadeSemPrazo = (r: RegAtual, chaves: Set<string> = chavesSemPrazo()) => chaves.has(chaveCidade(r.dados["Consignee City"]));
function tentativaNoDia(r: RegAtual, refDia: string): boolean {
  if (tentativasDe(r) < 1) return false;
  const dt = paraData(r.dados["Last Problem Date"]);
  return !!dt && diaIso(dt) === refDia;
}
// Por que a peça é (ou não) pendência: o texto serve à tela e à gaveta da encomenda.
function motivoPendencia(r: RegAtual, refDia = refDiaAnalise(), chaves: Set<string> = chavesSemPrazo()): { pendente: boolean; motivo: string } {
  if (r.entrega_confirmada) return { pendente: false, motivo: "Entrega confirmada no relatório." };
  if (tentativaNoDia(r, refDia)) return { pendente: false, motivo: "Teve tentativa de entrega no dia da referência: sai da lista de pendentes e aparece nas listas de tentativas." };
  const cidade = String(r.dados["Consignee City"] ?? "").trim() || "a cidade";
  if (ehCidadeSemPrazo(r, chaves)) return { pendente: true, motivo: `Peça de ${cidade}: é pendência qualquer que seja a data de chegada (cidade sem prazo, em Regras de abrangência).` };
  const dia = diaChegada(r);
  if (dia === SEM_DATA) return { pendente: true, motivo: "Sem data de chegada: não dá para provar que chegou hoje, então conta como pendência." };
  if (dia < refDia) return { pendente: true, motivo: `Chegou em ${fmtDia(dia)}, antes do dia da referência (${fmtDia(refDia)}): o prazo de um dia já venceu.` };
  return { pendente: false, motivo: `Chegou no dia da referência (${fmtDia(refDia)}) e ${cidade} tem prazo de um dia: ainda está dentro do prazo.` };
}
const ehPendencia = (r: RegAtual, refDia = refDiaAnalise(), chaves: Set<string> = chavesSemPrazo()) => motivoPendencia(r, refDia, chaves).pendente;

// 1 e 2 tentativas listam TODA peça com essa quantidade de tentativas e problema (inclusive a que já saiu para rota de novo,
// que aparece com a marca "já em rota"). Só pede ação sua a que ainda não saiu: ver `pedeAcao`.
const PEND: Record<AcaoPend, (r: RegAtual) => boolean> = {
  atrasadas: (r) => ehPendencia(r),
  tent1: (r) => r.excecoes.includes("insucesso") && !r.excecoes.includes("avaria") && tentativasDe(r) === 1 && !r.entrega_confirmada,
  tent2: (r) => r.excecoes.includes("insucesso") && !r.excecoes.includes("avaria") && tentativasDe(r) === 2 && !r.entrega_confirmada,
  tent3: (r) => (r.excecoes.includes("devolucao") || (r.excecoes.includes("revisar_tentativas") && !r.excecoes.includes("avaria"))) && !r.entrega_confirmada,
  extravio: (r) => r.excecoes.includes("extravio"),
  avaria: (r) => r.excecoes.includes("avaria") && !r.entrega_confirmada,
  ja_em_rota: (r) => r.excecoes.includes("insucesso") && !r.excecoes.includes("avaria") && r.reroteada && !r.entrega_confirmada,
};
const ACOES_URGENTES: AcaoPend[] = ["atrasadas", "tent1", "tent2", "tent3", "extravio", "avaria"];
// Peça de 1 ou 2 tentativas que já saiu para rota de novo não pede ação: fica na lista, marcada, mas fora dos alertas.
const pedeAcao = (a: AcaoPend, r: RegAtual) => !((a === "tent1" || a === "tent2") && r.reroteada);
const pendAtivas = (a: AcaoPend) => (E.analise ? E.analise.atual.filter((r) => PEND[a](r) && !justificada(awbDe(r.dados))) : []);
const pendAcao = (a: AcaoPend) => pendAtivas(a).filter((r) => pedeAcao(a, r));
const pendPrecisaAcao = (r: RegAtual) => !justificada(awbDe(r.dados)) && ACOES_URGENTES.some((a) => PEND[a](r) && pedeAcao(a, r));
const pendJustificadas = () => (E.analise ? E.analise.atual.filter((r) => justificada(awbDe(r.dados)) && (r.excecoes.length || PEND.atrasadas(r))) : []);
const errosPiso = () => (E.analise ? E.analise.atual.filter((r) => r.erro_piso) : []);

function contar<T>(itens: T[], chave: (x: T) => string | null): { rotulo: string; valor: number }[] {
  const m = new Map<string, number>();
  for (const i of itens) { const k = chave(i); if (k === null) continue; m.set(k, (m.get(k) || 0) + 1); }
  return [...m].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor || (a.rotulo < b.rotulo ? -1 : 1));
}
const unicos = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => x !== null && x !== undefined && String(x).trim() !== "").map((x) => String(x)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
// Tempo em rota = desde a saída para entrega (Delivery Time) até a referência.
const FAIXAS_ROTA = ["Menos de 12 h", "12 a 24 h", "Mais de 24 h", "Sem saída registrada"];
const TOM_ROTA: Record<string, Tom> = { "Menos de 12 h": "ok", "12 a 24 h": "atencao", "Mais de 24 h": "critico", "Sem saída registrada": "neutro" };
function faixaRota(r: RegAtual): string | null {
  if (r.entrega_confirmada) return null;
  const m = r.em_rota_min;
  return m === null ? "Sem saída registrada" : m < 720 ? "Menos de 12 h" : m < 1440 ? "12 a 24 h" : "Mais de 24 h";
}
const entregadorDe = (d: Dados) => (d["Delivery Associate"] === null || d["Delivery Associate"] === undefined ? "(sem entregador)" : String(d["Delivery Associate"]));
