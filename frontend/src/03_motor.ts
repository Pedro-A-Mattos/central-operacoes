// Motor local — porta fiel de backend/logistica (comparador, regras, metricas,
// excecoes, pipeline). Usado só quando a API Python não está disponível
// (demonstração no navegador). A paridade com o motor Python é verificada por
// tests/paridade.mjs sobre as planilhas de exemplo. A fonte de verdade é o Python.

const AWB = "Waybill No", STATUS = "Last Scan Status", PROB = "Last Problem Type", MOTIVO = "Last Problem Reason";
const CIDADE = "Consignee City", AREA = "Consignee Area", ENTREG = "Delivery Associate", CHEGADA = "Arrival Time";
const CONTAGEM = "Delivery Count", DELIV_TIME = "Delivery Time", SIGN_DATE = "Sign Date";
const COLUNAS_EVENTO = ["Arrival Time", "Last Problem Date", "Delivery Time", "Sign Date"];
const RE_HORARIO_NOME = /(\d{4})-(\d{2})-(\d{2})[T_ ](\d{2})[:h-]?(\d{2})[:m-]?(\d{2})/;
// OP-02: motivos que caracterizam ausência ou recusa (espelha excecoes.MOTIVOS_DEVOLUCAO)
const MOTIVOS_DEVOLUCAO = ["não recebido", "nao recebido", "local fechado", "telefone não atendido", "telefone nao atendido", "telefone errado", "recusad", "ausente"];

const VALORES_FM = new Set(["ocorrênia fm", "ocorrencia fm", "force majeure"]); // referência
// Força maior: duas grafias da iMile ("Ocorrênia FM" e "Force majeure") e variações.
// Detecção por conteúdo, sem acento: "force majeure"/"forca maior" ou "fm" isolado.
const RE_FM = /(?:\bfm\b|force\s*majeure|forca\s+maior)/;
const canonFm = (v: Valor | undefined): string =>
  (v === null || v === undefined ? "" : String(v)).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const ehFm = (v: Valor | undefined): boolean => RE_FM.test(canonFm(v));
const PALAVRAS_DEVOLUCAO = ["devol", "não recebido", "nao recebido", "recusad", "retorno"];
const PALAVRAS_EXTRAVIO = ["lost", "extravi"];
const STATUS_ENTREGUE = new Set(["entregue", "assinado", "signed", "delivered"]);
const FAIXAS: Faixa[] = ["0-1 dia", "2-3 dias", "4+ dias"];
const LIMIAR_RUIDO_PADRAO = 3, MIN_URBANO = 3, LIMITE_TENTATIVAS = 3;
const SEM_ENTREGADOR = "(sem entregador)";
const COLUNAS_CONTRATO = [
  "Waybill No", "Reference No", "Last Scan Status", "Last Problem Type", "Last Problem Reason", "Last Problem Date",
  "Consignee City", "Consignee Area", "Consignee Address", "Consignee Zip Code", "Delivery Associate", "Delivery Count",
  "Delivery Time", "Arrival Time", "Waybill Hold Time", "Estimated Delivery Time", "Dispatch Station", "Consignee Route Code",
  "Sign Date", "Consignee Latitude", "Consignee Longitude",
];
const COLUNAS_LOGICA: [string, boolean, string][] = [
  ["Waybill No", true, "Código da encomenda (AWB) — chave da comparação"],
  ["Consignee City", false, "Cidade — sem ela a encomenda fica fora da jurisdição"],
  ["Delivery Associate", false, "Entregador — usado na conferência de piso e no desempenho"],
  ["Consignee Area", false, "Bairro — conferência de piso em cidades com muitos entregadores"],
  ["Last Scan Status", false, "Status — mudanças de status e filtros de descarregado e não recebido"],
  ["Last Problem Type", false, "Tipo do problema — força maior, exceções, devoluções"],
  ["Last Problem Reason", false, "Motivo do problema — indício de devolução e extravio"],
  ["Delivery Count", false, "Tentativas de entrega — regra de devolução (3 ou mais)"],
  ["Arrival Time", false, "Chegada ao galpão — faixas de tempo e filtro de dias"],
  ["Delivery Time", false, "Saída para entrega — tempo em rota"],
  ["Sign Date", false, "Data de assinatura — entrega confirmada"],
];

type Tabela = { colunas: string[]; linhas: Dados[] };

// ---------- utilidades com semântica do pandas ----------
const ehNulo = (v: Valor | undefined) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
const txt = (v: Valor | undefined): string | null => { if (ehNulo(v)) return null; const s = String(v).trim(); return s || null; };
const temValor = (v: Valor | undefined) => !ehNulo(v) && String(v).trim() !== "";
const minus = (v: Valor | undefined) => (ehNulo(v) ? "" : String(v)).toLowerCase();

function paraData(v: Valor | undefined): Date | null {
  if (ehNulo(v)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v).trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return Number.isNaN(d.getTime()) ? null : d;
}
const diaIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dataHoraIso = (d: Date) => `${diaIso(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

function normalizarAwb(v: Valor | undefined): string | null {
  if (ehNulo(v)) return null;
  let s = typeof v === "number" ? (Number.isInteger(v) ? v.toFixed(0) : String(v)) : String(v);
  s = s.replace(/\.0$/, "").trim();
  return s || null;
}

function normalizarRelatorio(t: Tabela): Dados[] {
  if (!t.colunas.includes(AWB)) throw new ErroLeitura({
    titulo: "Falta a coluna do código da encomenda",
    significado: "Sem a coluna 'Waybill No' não é possível comparar os relatórios.",
    acao: "Exporte novamente o relatório Dispatch completo, sem remover colunas.",
  });
  const ultimaPos = new Map<string, number>();
  const linhas: Dados[] = [];
  for (const l of t.linhas) {
    const awb = normalizarAwb(l[AWB]);
    if (!awb) continue;
    const r = { ...l, [AWB]: awb };
    if (ultimaPos.has(awb)) linhas[ultimaPos.get(awb)!] = null as unknown as Dados;
    ultimaPos.set(awb, linhas.length);
    linhas.push(r);
  }
  return linhas.filter(Boolean);
}

const filtroDescarregado = (df: Dados[], ligado: boolean) =>
  ligado ? df.filter((r) => minus(r[STATUS]).trim() !== "descarregado") : df;
const VALORES_NAO_RECEBIDO = new Set(["não recebido", "nao recebido"]);
// Remove quando "não recebido" aparece no Last Scan Status OU no Last Problem Type.
const filtroNaoRecebido = (df: Dados[], ligado: boolean) =>
  ligado ? df.filter((r) => !VALORES_NAO_RECEBIDO.has(minus(r[STATUS]).trim()) && !VALORES_NAO_RECEBIDO.has(minus(r[PROB]).trim())) : df;
// "Não recebido, com indício de entrega": do atual bruto (antes dos filtros).
// Indício = entrega confirmada (status/assinatura) OU Delivery Time preenchido.
function naoRecebidoComEntrega(ult: Dados[]): { dados: Dados; categoria: string; confirmada: boolean }[] {
  const out: { dados: Dados; categoria: string; confirmada: boolean }[] = [];
  for (const r of ult) {
    const ehNr = VALORES_NAO_RECEBIDO.has(minus(r[STATUS]).trim()) || VALORES_NAO_RECEBIDO.has(minus(r[PROB]).trim());
    if (!ehNr) continue;
    const conf = entregaConfirmada(r);
    const temDt = temValor(r[DELIV_TIME]);
    if (!conf && !temDt) continue;
    out.push({ dados: contrato(r), categoria: temDt ? "Com Delivery Time" : "Sem Delivery Time", confirmada: conf });
  }
  return out;
}
const removerFm = (df: Dados[]) => df.filter((r) => !ehFm(r[PROB]));
function separarFora(df: Dados[]): [Dados[], Dados[]] {
  const d: Dados[] = [], f: Dados[] = [];
  for (const r of df) (txt(r[CIDADE]) ? d : f).push(r);
  return [d, f];
}
// Pré-processamento para o estudo/validação de regiões: normaliza, remove força
// maior e descarta linhas sem cidade (idêntico ao backend que gerou o mapa padrão).
function prepRegiao(t: Tabela): Dados[] {
  return separarFora(removerFm(normalizarRelatorio(t)))[0];
}
const diasDisponiveis = (df: Dados[]) =>
  [...new Set(df.map((r) => paraData(r[CHEGADA])).filter((d): d is Date => !!d).map(diaIso))].sort();
function filtrarDias(df: Dados[], dias: string[]): Dados[] {
  if (!dias.length) return df;
  const s = new Set(dias);
  return df.filter((r) => { const d = paraData(r[CHEGADA]); return !!d && s.has(diaIso(d)); });
}
const textoProblema = (r: Dados) => (`${ehNulo(r[PROB]) ? "" : r[PROB]} ${ehNulo(r[MOTIVO]) ? "" : r[MOTIVO]}`).toLowerCase();
const palavraDevolucao = (r: Dados) => PALAVRAS_DEVOLUCAO.find((p) => textoProblema(r).includes(p)) || null;

interface Comparacao {
  pendentes: Dados[]; saiuEntregue: Dados[]; saiuDevolucao: Dados[]; novas: Dados[];
  mudou: { awb: string; sb: Valor; su: Valor }[];
}

function comparar(base: Dados[], ult: Dados[]): Comparacao {
  const bIds = new Set(base.map((r) => r[AWB] as string));
  const uIds = new Set(ult.map((r) => r[AWB] as string));
  const saiu = base.filter((r) => !uIds.has(r[AWB] as string));
  const bMap = new Map(base.map((r) => [r[AWB] as string, r]));
  const mudou: Comparacao["mudou"] = [];
  const temStatus = base.length > 0 && ult.length > 0;
  if (temStatus) for (const r of ult) {
    const a = r[AWB] as string; if (!bIds.has(a)) continue;
    const sb = bMap.get(a)![STATUS] ?? null, su = r[STATUS] ?? null;
    if (ehNulo(sb) !== ehNulo(su) || String(sb) !== String(su)) mudou.push({ awb: a, sb: ehNulo(sb) ? null : sb, su: ehNulo(su) ? null : su });
  }
  return {
    pendentes: ult, novas: ult.filter((r) => !bIds.has(r[AWB] as string)),
    saiuDevolucao: saiu.filter((r) => palavraDevolucao(r)), saiuEntregue: saiu.filter((r) => !palavraDevolucao(r)), mudou,
  };
}

// ---------- regras de piso ----------
interface Regras {
  porCidade: Map<string, Set<string>>; porBairro: Map<string, Set<string>>;
  urbanas: Set<string>; origem: Map<string, string>;
}
const chaveBairro = (c: string, b: string) => c + "\u0000" + b;

function conjuntoValido(cont: Map<string, number>, limiar: number): Set<string> {
  const s = new Set<string>(); let dom: string | null = null, max = -1;
  for (const [k, n] of cont) { if (n >= limiar) s.add(k); if (n > max) { max = n; dom = k; } }
  if (dom !== null) s.add(dom);
  return s;
}

function derivarRegras(base: Dados[], limiar: number): Regras {
  const rg: Regras = { porCidade: new Map(), porBairro: new Map(), urbanas: new Set(), origem: new Map() };
  const porCid = new Map<string, Dados[]>();
  for (const r of base) { const c = txt(r[CIDADE]); if (!c) continue; if (!porCid.has(c)) porCid.set(c, []); porCid.get(c)!.push(r); }
  for (const [c, rows] of porCid) {
    const com = rows.filter((r) => txt(r[ENTREG]));
    const cont = new Map<string, number>();
    for (const r of com) { const e = txt(r[ENTREG])!; cont.set(e, (cont.get(e) || 0) + 1); }
    rg.porCidade.set(c, conjuntoValido(cont, limiar));
    rg.origem.set(c, "derivada");
    if (cont.size >= MIN_URBANO) {
      rg.urbanas.add(c);
      const porB = new Map<string, Map<string, number>>();
      for (const r of com) {
        const b = txt(r[AREA]); if (!b) continue;
        if (!porB.has(b)) porB.set(b, new Map());
        const m = porB.get(b)!; const e = txt(r[ENTREG])!; m.set(e, (m.get(e) || 0) + 1);
      }
      for (const [b, m] of porB) rg.porBairro.set(chaveBairro(c, b), conjuntoValido(m, limiar));
    }
  }
  return rg;
}

// ---------- Modo Estudo / Validação por REGIÃO (CEP) — espelha regras.py ----------
const ZIP = "Consignee Zip Code";
const LIMIAR_REGIAO_PADRAO = 10;

function canonCep(v: Valor | undefined): string | null {
  const s = txt(v);
  if (s === null) return null;
  const d = s.replace(/\D/g, "");
  return d || null;
}
function contarPor(rows: Dados[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) { const e = txt(r[ENTREG]); if (!e) continue; m.set(e, (m.get(e) || 0) + 1); }
  return m;
}
function derivarRegiaoLocal(base: Dados[], limiar: number): MapaRegiao {
  const com = base.filter((r) => txt(r[ENTREG]));
  const porCep: Record<string, string[]> = {};
  const grpCep = new Map<string, Dados[]>();
  for (const r of com) { const c = canonCep(r[ZIP]); if (!c) continue; (grpCep.get(c) || grpCep.set(c, []).get(c)!).push(r); }
  for (const [c, rows] of grpCep) { const v = conjuntoValido(contarPor(rows), limiar); if (v.size) porCep[c] = [...v].sort(); }
  const porBairro: Record<string, string[]> = {};
  const grpB = new Map<string, Dados[]>();
  for (const r of com) { const ci = txt(r[CIDADE]), b = txt(r[AREA]); if (!ci || !b) continue; const k = ci + "|" + b; (grpB.get(k) || grpB.set(k, []).get(k)!).push(r); }
  for (const [k, rows] of grpB) { const v = conjuntoValido(contarPor(rows), limiar); if (v.size) porBairro[k] = [...v].sort(); }
  const porCidade: Record<string, string[]> = {};
  const grpC = new Map<string, Dados[]>();
  for (const r of com) { const ci = txt(r[CIDADE]); if (!ci) continue; (grpC.get(ci) || grpC.set(ci, []).get(ci)!).push(r); }
  for (const [ci, rows] of grpC) { const v = conjuntoValido(contarPor(rows), limiar); if (v.size) porCidade[ci] = [...v].sort(); }
  const ordenar = (o: Record<string, string[]>): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const k of Object.keys(o).sort()) out[k] = o[k];
    return out;
  };
  return { limiar: Math.round(limiar), por_cep: ordenar(porCep), por_bairro: ordenar(porBairro), por_cidade: ordenar(porCidade) };
}
interface ErroRegiao extends ErroRegiaoReg {}
const ERRO_REG_FORA = "Entregador fora da região", ERRO_REG_SEM_ENT = "Sem entregador", ERRO_REG_SEM_REGRA = "Região sem regra conhecida";
function validosRegiao(mapa: MapaRegiao, cep: Valor | undefined, bairro: Valor | undefined, cidade: Valor | undefined): [Set<string>, string, boolean] {
  const c = canonCep(cep);
  if (c && mapa.por_cep[c]) return [new Set(mapa.por_cep[c]), "cep", true];
  const b = txt(bairro), ci = txt(cidade);
  if (ci && b && mapa.por_bairro[ci + "|" + b]) return [new Set(mapa.por_bairro[ci + "|" + b]), "bairro", true];
  if (ci && mapa.por_cidade[ci]) return [new Set(mapa.por_cidade[ci]), "cidade", true];
  return [new Set(), "regiao", false];
}
function validarRegiaoLocal(rows: Dados[], mapa: MapaRegiao): ErroRegiao[] {
  const out: ErroRegiao[] = [];
  for (const r of rows) {
    const [validos, escopo, temRegra] = validosRegiao(mapa, r[ZIP], r[AREA], r[CIDADE]);
    const ent = txt(r[ENTREG]);
    const base = { awb: String(r[AWB]), dados: r, esperados: [...validos].sort(), escopo };
    if (!temRegra) out.push({ ...base, tipo: ERRO_REG_SEM_REGRA, detalhe: "Região sem regra no mapeamento; não dá para julgar." });
    else if (!ent) out.push({ ...base, tipo: ERRO_REG_SEM_ENT, detalhe: "Entrega sem entregador atribuído." });
    else if (!validos.has(ent)) out.push({ ...base, tipo: ERRO_REG_FORA, detalhe: `${ent} não costuma atender esta região.` });
  }
  return out;
}

function aplicarOverrides(rg: Regras, ov: Overrides): Regras {
  for (const [c, ents] of Object.entries(ov.por_cidade || {})) {
    rg.porCidade.set(c, new Set(ents)); rg.urbanas.delete(c); rg.origem.set(c, "ajuste manual");
  }
  return rg;
}

function validos(rg: Regras, c: string, b: string | null): [Set<string>, "bairro" | "cidade"] {
  if (rg.urbanas.has(c) && b && rg.porBairro.has(chaveBairro(c, b))) return [rg.porBairro.get(chaveBairro(c, b))!, "bairro"];
  return [rg.porCidade.get(c) || new Set(), "cidade"];
}

// Conferência de piso usando o MAPA DE REGIÃO (CEP->bairro->cidade), quando houver.
// Reaproveita os mesmos tipos de erro da conferência de piso para a tela não mudar.
function validarPisoPorRegiao(pend: Dados[], mapa: MapaRegiao, ignoradas: string[]): Map<string, ErroPiso> {
  const ign = new Set(ignoradas); const out = new Map<string, ErroPiso>();
  for (const r of pend) {
    const c = txt(r[CIDADE]);
    if (c !== null && ign.has(c)) continue;
    const awb = r[AWB] as string;
    const [validos, escopo, temRegra] = validosRegiao(mapa, r[ZIP], r[AREA], r[CIDADE]);
    const esperados = [...validos].sort();
    if (!temRegra) { out.set(awb, { tipo: "Cidade fora da abrangência", detalhe: "Região (CEP/bairro/cidade) sem regra no mapeamento do estudo.", esperados: [], escopo: escopo as ErroPiso["escopo"], origem_regra: "mapa de região" }); continue; }
    const e = txt(r[ENTREG]);
    if (!e) { out.set(awb, { tipo: "Sem entregador", detalhe: "Peça sem entregador atribuído.", esperados, escopo: escopo as ErroPiso["escopo"], origem_regra: "mapa de região" }); continue; }
    if (!validos.has(e)) { out.set(awb, { tipo: "Entregador fora da área", detalhe: `${e} não costuma atender esta região.`, esperados, escopo: escopo as ErroPiso["escopo"], origem_regra: "mapa de região" }); }
  }
  return out;
}

function validarPiso(pend: Dados[], rg: Regras, ignoradas: string[]): Map<string, ErroPiso> {
  const ign = new Set(ignoradas); const out = new Map<string, ErroPiso>();
  const ordena = (s: Set<string> | null) => (s ? [...s].sort() : []);
  for (const r of pend) {
    const c = txt(r[CIDADE]);
    if (c !== null && ign.has(c)) continue;
    const awb = r[AWB] as string;
    if (!c) { out.set(awb, { tipo: "Cidade ausente", detalhe: "Peça sem cidade de destino.", esperados: [], escopo: "cidade", origem_regra: "sem regra" }); continue; }
    if (!rg.porCidade.has(c)) { out.set(awb, { tipo: "Cidade fora da abrangência", detalhe: `${c} não aparece nas regras de abrangência.`, esperados: [], escopo: "cidade", origem_regra: "sem regra" }); continue; }
    const e = txt(r[ENTREG]); const b = txt(r[AREA]);
    const [v, escopo] = validos(rg, c, b);
    const origem = rg.origem.get(c) || "sem regra";
    if (!e) { out.set(awb, { tipo: "Sem entregador", detalhe: `Peça de ${c} sem entregador atribuído.`, esperados: ordena(v), escopo, origem_regra: origem }); continue; }
    if (!v.has(e)) {
      const local = escopo === "bairro" ? `${b} (${c})` : c;
      out.set(awb, { tipo: "Entregador fora da área", detalhe: `${e} não costuma entregar em ${local}.`, esperados: ordena(v), escopo, origem_regra: origem });
    }
  }
  return out;
}

// ---------- métricas e exceções ----------
// OP-01: entregue = confirmado pelo relatório (status ou data de assinatura). Delivery Time = saída para entrega.
const entregaConfirmada = (r: Dados) => STATUS_ENTREGUE.has(minus(r[STATUS]).trim()) || temValor(r[SIGN_DATE]);
function classificar(r: Dados): Classe {
  if (temValor(r[PROB])) return "Anormal";
  if (entregaConfirmada(r)) return "Entregue";
  return "Não entregue";
}
function minutosEmRota(r: Dados, ref: Date): number | null {
  if (entregaConfirmada(r)) return null;
  const d = paraData(r[DELIV_TIME]); if (!d) return null;
  const m = Math.floor((ref.getTime() - d.getTime()) / 60000);
  return m < 0 ? null : m;
}
// OP-06: referência do tempo de espera vinda do próprio relatório.
function referenciaDoRelatorio(nome: string, linhas: Dados[] | null): [Date | null, OrigemReferencia] {
  const m = RE_HORARIO_NOME.exec(nome || "");
  if (m) {
    const [y, mo, d, hh, mi, ss] = m.slice(1).map(Number);
    const dt = new Date(y, mo - 1, d, hh, mi, ss);
    if (dt.getMonth() === mo - 1 && dt.getDate() === d && hh < 24 && mi < 60 && ss < 60) return [dt, "nome_arquivo"];
  }
  if (linhas) {
    let max: number | null = null;
    for (const r of linhas) for (const c of COLUNAS_EVENTO) { const d = paraData(r[c]); if (d && (max === null || d.getTime() > max)) max = d.getTime(); }
    if (max !== null) return [new Date(max), "ultimo_evento"];
  }
  return [null, "relogio"];
}
function backlogDias(r: Dados, ref: Date): number | null {
  const d = paraData(r[CHEGADA]); return d ? (ref.getTime() - d.getTime()) / 86400000 : null;
}
function faixaDe(dias: number | null): Faixa | null {
  if (dias === null || dias < 0) return null;
  return dias < 2 ? FAIXAS[0] : dias < 4 ? FAIXAS[1] : FAIXAS[2];
}
function contagem(r: Dados): number | null {
  const v = r[CONTAGEM]; if (ehNulo(v)) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return String(v).trim() === "" || Number.isNaN(n) ? null : n;
}
const ehExtravio = (r: Dados) => PALAVRAS_EXTRAVIO.some((p) => textoProblema(r).includes(p));
const motivoDevolucao = (r: Dados) => MOTIVOS_DEVOLUCAO.find((p) => textoProblema(r).includes(p)) || null;
const tresTentativas = (r: Dados) => { const c = contagem(r); return c !== null && c >= LIMITE_TENTATIVAS; };
const ehDevolucao = (r: Dados) => tresTentativas(r) && !!motivoDevolucao(r);
const ehRevisar = (r: Dados) => tresTentativas(r) && !motivoDevolucao(r);
const ehInsucesso = (r: Dados) => temValor(r[PROB]) && (contagem(r) ?? 0) < LIMITE_TENTATIVAS && !ehExtravio(r);

function desempenhoLocal(baseF: Dados[], ultF: Dados[], dias: string[]): Desempenho {
  const b = filtrarDias(baseF, dias), u = filtrarDias(ultF, dias);
  const cmp = comparar(b, u);
  const ids = new Set(cmp.saiuEntregue.map((r) => r[AWB] as string));
  const probUlt = new Map(u.map((r) => [r[AWB] as string, temValor(r[PROB])]));
  const grupos = new Map<string, Dados[]>();
  for (const r of b) { const e = ehNulo(r[ENTREG]) ? SEM_ENTREGADOR : String(r[ENTREG]); if (!grupos.has(e)) grupos.set(e, []); grupos.get(e)!.push(r); }
  const linhas: LinhaDesempenho[] = []; const awbs: Desempenho["awbs"] = {};
  for (const [e, g] of [...grupos].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const cls: Record<string, string[]> = {};
    let ent = 0, an = 0, pe = 0;
    for (const r of g) {
      const a = r[AWB] as string;
      if (ids.has(a)) { ent++; (cls["Entregue"] ||= []).push(a); }
      if (probUlt.has(a)) { if (probUlt.get(a)) { an++; (cls["Anormal"] ||= []).push(a); } else { pe++; (cls["Pendente"] ||= []).push(a); } }
    }
    linhas.push({ entregador: e, total: g.length, entregue: ent, anormal: an, pendente: pe, pct_entregue: g.length ? Math.round((1000 * ent) / g.length) / 10 : 0 });
    awbs[e] = cls;
  }
  return { dias: [...dias], linhas, awbs };
}

// ---------- validação de arquivo (passo 2) ----------
function validarTabela(t: Tabela, nome: string): ValidacaoArquivo {
  const problemas: ProblemaArquivo[] = [], avisos: string[] = [];
  const colunas = COLUNAS_LOGICA.map(([coluna, obrigatoria, papel]) => {
    const presente = t.colunas.includes(coluna);
    if (!presente && obrigatoria) problemas.push({
      titulo: "Falta a coluna do código da encomenda",
      significado: "Sem a coluna 'Waybill No' não é possível comparar os relatórios.",
      acao: "Exporte novamente o relatório Dispatch completo, sem remover colunas.",
    });
    else if (!presente) avisos.push(`Coluna '${coluna}' não encontrada: ${papel.split(" — ")[1] || papel} ficará indisponível.`);
    return { coluna, obrigatoria, presente, papel };
  });
  const info: ValidacaoArquivo = { nome, linhas: t.linhas.length, colunas_total: t.colunas.length, colunas, problemas, avisos,
    sem_awb: 0, duplicadas: 0, validas: 0, chegada_min: null, chegada_max: null, previa: [] };
  if (problemas.length) return info;
  info.sem_awb = t.linhas.filter((l) => !normalizarAwb(l[AWB])).length;
  const norm = normalizarRelatorio(t);
  info.validas = norm.length;
  info.duplicadas = t.linhas.length - info.sem_awb - norm.length;
  if (info.sem_awb) avisos.push(`${info.sem_awb} linha(s) sem código da encomenda serão descartadas.`);
  if (info.duplicadas) avisos.push(`${info.duplicadas} código(s) repetido(s): será mantida a última ocorrência de cada um.`);
  const datas = norm.map((r) => paraData(r[CHEGADA])).filter((d): d is Date => !!d).map((d) => d.getTime());
  if (datas.length) { info.chegada_min = dataHoraIso(new Date(Math.min(...datas))); info.chegada_max = dataHoraIso(new Date(Math.max(...datas))); }
  info.previa = norm.slice(0, 5).map(contrato);
  const [ref, origem] = referenciaDoRelatorio(nome, norm);
  info.referencia_sugerida = ref ? dataHoraIso(ref) : null;
  info.referencia_origem = origem;
  info.qualidade = qualidade(norm);
  return info;
}

const canon = (v: Valor) => String(v).normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
function grafias(df: Dados[], col: string, grupo: string | null): string[][] {
  const mapa = new Map<string, Set<string>>();
  for (const r of df) {
    const v = r[col];
    if (ehNulo(v) || String(v).trim() === "") continue;
    const g = grupo && !ehNulo(r[grupo]) ? String(r[grupo]).trim() : "";
    const k = g + "|" + canon(v as Valor);
    if (!mapa.has(k)) mapa.set(k, new Set());
    mapa.get(k)!.add(String(v));
  }
  return [...mapa.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((k) => [...mapa.get(k)!].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).filter((x) => x.length > 1);
}
function qualidade(norm: Dados[]): ItemQualidade[] {
  const out: ItemQualidade[] = [];
  const add = (codigo: string, titulo: string, n: number, impacto: string, exemplos: string[] = [], tom: "atencao" | "info" = "atencao") => {
    if (n) out.push({ codigo, titulo, n, impacto, exemplos, tom });
  };
  let g = grafias(norm, AREA, CIDADE);
  add("grafia_bairro", "bairros escritos de formas diferentes", g.length, "Na conferência por bairro, cada grafia vira um bairro separado com regra própria.", g.slice(0, 3).map((x) => x.join(" / ")));
  g = grafias(norm, CIDADE, null);
  add("grafia_cidade", "cidades escritas de formas diferentes", g.length, "Cada grafia vira uma cidade separada nos indicadores e na conferência.", g.slice(0, 3).map((x) => x.join(" / ")));
  g = grafias(norm, ENTREG, null);
  add("grafia_entregador", "entregadores com nomes escritos de formas diferentes", g.length, "O desempenho de uma mesma pessoa fica dividido.", g.slice(0, 3).map((x) => x.join(" / ")));
  const comCidade = (r: Dados) => temValor(r[CIDADE]);
  add("sem_cidade", "linhas sem cidade de destino", norm.filter((r) => !comCidade(r)).length, "Ficam em “Fora da jurisdição” e não entram em nenhum indicador.", [], "info");
  if (norm.length && CHEGADA in norm[0]) add("sem_chegada", "linhas sem data de chegada válida", norm.filter((r) => !paraData(r[CHEGADA])).length, "Ficam fora das faixas de tempo de espera e do filtro por dia.");
  add("sem_entregador", "linhas com cidade e sem entregador", norm.filter((r) => comCidade(r) && !temValor(r[ENTREG])).length, "Aparecem como “Sem entregador” na conferência de piso.");
  add("sem_bairro", "linhas com cidade e sem bairro", norm.filter((r) => comCidade(r) && !temValor(r[AREA])).length, "Nas cidades conferidas por bairro, são conferidas pela regra da cidade.", [], "info");
  add("entregue_confirmada", "encomendas já constam como entregues", norm.filter(entregaConfirmada).length, "Se este for o relatório atualizado, elas seguem contadas como pendentes (regra RN-003).", [], "info");
  return out;
}

// Simulação de mudança de regra (espelha pipeline.simular_regras).
function simularRegrasLocal(baseF: Dados[], ultF: Dados[], atual: ConfigRegras, novo: ConfigRegras): Simulacao {
  const erros = (c: ConfigRegras) => {
    const ov = c.overrides || { por_cidade: {}, cidades_ignoradas: [] };
    const rg = aplicarOverrides(derivarRegras(baseF, Math.round(c.limiar_ruido || LIMIAR_RUIDO_PADRAO)), ov);
    const ign = [...new Set([...(ov.cidades_ignoradas || []), ...(c.cidades_ignoradas || [])])];
    const m = new Map<string, string>(); for (const [k, v] of validarPiso(ultF, rg, ign)) m.set(k, v.tipo); return m;
  };
  const antes = erros(atual), depois = erros(novo);
  const dados = new Map(ultF.map((r) => [r[AWB] as string, r]));
  const mudancas: Simulacao["mudancas"] = [];
  for (const awb of [...new Set([...antes.keys(), ...depois.keys()])].sort()) {
    const a = antes.get(awb) ?? null, d = depois.get(awb) ?? null;
    if (a !== d) { const r = dados.get(awb)!; mudancas.push({ awb, cidade: ehNulo(r[CIDADE]) ? null : r[CIDADE], entregador: ehNulo(r[ENTREG]) ? null : r[ENTREG], antes: a, depois: d }); }
  }
  return { erros_antes: antes.size, erros_depois: depois.size, passam_a_erro: mudancas.filter((m) => m.antes === null).length,
    deixam_de_ser_erro: mudancas.filter((m) => m.depois === null).length, mudam_tipo: mudancas.filter((m) => m.antes && m.depois).length, mudancas };
}

function contrato(r: Dados): Dados {
  const o: Dados = {};
  for (const c of COLUNAS_CONTRATO) if (c in r) o[c] = ehNulo(r[c]) || (typeof r[c] === "string" && (r[c] as string).trim() === "") ? null : r[c];
  return o;
}

// ---------- pipeline completo ----------
interface ContextoLocal { baseF: Dados[]; ultF: Dados[] }

function analisarLocal(tb: Tabela, tu: Tabela, p: ParametrosAnalise, ov: Overrides,
  just: Record<string, Justificativa>, nomes: [string, string]): { analise: Analise; ctx: ContextoLocal } {
  const base = normalizarRelatorio(tb), ult = normalizarRelatorio(tu);
  let ref: Date | null = null, refOrigem: OrigemReferencia = "relogio";
  if (p.referencia_backlog && paraData(p.referencia_backlog)) { ref = paraData(p.referencia_backlog); refOrigem = "definida"; }
  else [ref, refOrigem] = referenciaDoRelatorio(nomes[1], ult);
  if (!ref) { ref = new Date(); ref.setMilliseconds(0); refOrigem = "relogio"; }
  const refFinal: Date = ref;
  const b1 = filtroDescarregado(base, p.ignorar_descarregado), u1 = filtroDescarregado(ult, p.ignorar_descarregado);
  const b1b = filtroNaoRecebido(b1, p.ignorar_nao_recebido), u1b = filtroNaoRecebido(u1, p.ignorar_nao_recebido);
  const b2 = removerFm(b1b), u2 = removerFm(u1b);
  const [baseF, baseFora] = separarFora(b2), [ultF, ultFora] = separarFora(u2);
  const res = comparar(baseF, ultF);
  const limiar = Math.max(1, Math.min(20, Math.round(p.limiar_ruido || LIMIAR_RUIDO_PADRAO)));
  const rg = aplicarOverrides(derivarRegras(baseF, limiar), ov);
  const ignoradas = [...new Set([...(ov.cidades_ignoradas || []), ...(p.cidades_ignoradas || [])])];
  const erros = p.mapa_regiao ? validarPisoPorRegiao(res.pendentes, p.mapa_regiao, ignoradas) : validarPiso(res.pendentes, rg, ignoradas);

  const bIds = new Set(baseF.map((r) => r[AWB] as string));
  const bMap = new Map(baseF.map((r) => [r[AWB] as string, r]));
  const mudouSet = new Set(res.mudou.map((m) => m.awb));
  const ids = (df: Dados[]) => new Set(df.map((r) => r[AWB] as string));
  const diff = (a: Dados[], b: Dados[]) => { const s = ids(b); return a.map((r) => r[AWB] as string).filter((x) => !s.has(x)); };

  const atual: RegAtual[] = res.pendentes.map((r) => {
    const a = r[AWB] as string; const dias = backlogDias(r, refFinal); const rota = minutosEmRota(r, refFinal);
    const ex: TipoExcecao[] = [];
    if (ehDevolucao(r)) ex.push("devolucao"); if (ehExtravio(r)) ex.push("extravio"); if (ehInsucesso(r)) ex.push("insucesso"); if (ehRevisar(r)) ex.push("revisar_tentativas");
    const naBase = bIds.has(a);
    const sb = naBase ? bMap.get(a)![STATUS] : null; const eb = naBase ? bMap.get(a)![ENTREG] : null;
    return {
      dados: contrato(r), nova: !naBase, classe_operacional: classificar(r),
      backlog_dias: dias === null ? null : Math.round(dias * 100) / 100, faixa_backlog: faixaDe(dias),
      em_rota_min: rota, entrega_confirmada: entregaConfirmada(r), motivo_devolucao: motivoDevolucao(r),
      status_base: ehNulo(sb) ? null : sb ?? null, mudou_status: mudouSet.has(a),
      entregador_base: ehNulo(eb) ? null : eb ?? null, erro_piso: erros.get(a) || null, excecoes: ex,
    };
  });
  const sairam: RegSaiu[] = [
    ...res.saiuEntregue.map((r) => ({ dados: contrato(r), categoria: "provavel_entrega" as const, indicio: palavraDevolucao(r) })),
    ...res.saiuDevolucao.map((r) => ({ dados: contrato(r), categoria: "possivel_devolucao" as const, indicio: palavraDevolucao(r) })),
  ];
  const porCidade: Analise["regras"]["por_cidade"] = {};
  for (const c of [...rg.porCidade.keys()].sort()) porCidade[c] = { entregadores: [...rg.porCidade.get(c)!].sort(), origem: rg.origem.get(c) || "derivada", urbana: rg.urbanas.has(c) };
  const porBairro = [...rg.porBairro].map(([k, v]) => { const [cidade, bairro] = k.split("\u0000"); return { cidade, bairro, entregadores: [...v].sort() }; })
    .sort((x, y) => (x.cidade + x.bairro < y.cidade + y.bairro ? -1 : 1));
  const bAll = ids(base), uAll = ids(ult);
  const soAtual = [...uAll].filter((x) => !bAll.has(x)).length, soBase = [...bAll].filter((x) => !uAll.has(x)).length;

  const analise: Analise = {
    versao: 2, motor: "local", gerado_em: dataHoraIso(new Date()).replace(" ", "T"), referencia_backlog: dataHoraIso(refFinal),
    referencia_origem: refOrigem, entregues_confirmadas: res.pendentes.filter(entregaConfirmada).length,
    arquivos: { base: nomes[0], atual: nomes[1] },
    parametros: { ignorar_descarregado: p.ignorar_descarregado, ignorar_nao_recebido: p.ignorar_nao_recebido, limiar_ruido: limiar, min_entregadores_urbano: MIN_URBANO, limite_tentativas: LIMITE_TENTATIVAS, cidades_ignoradas: ignoradas, motivos_devolucao: [...MOTIVOS_DEVOLUCAO] },
    etapas: { base_lidas: base.length, atual_lidas: ult.length, descarregado_base: base.length - b1.length, descarregado_atual: ult.length - u1.length,
      nao_recebido_base: b1.length - b1b.length, nao_recebido_atual: u1.length - u1b.length,
      fm_base: b1b.length - b2.length, fm_atual: u1b.length - u2.length, fora_base: baseFora.length, fora_atual: ultFora.length },
    removidas: { fm: [...new Set([...diff(b1b, b2), ...diff(u1b, u2)])].sort(), descarregado: [...new Set([...diff(base, b1), ...diff(ult, u1)])].sort(),
      nao_recebido: [...new Set([...diff(b1, b1b), ...diff(u1, u1b)])].sort() },
    resumo: { base_total: baseF.length, ultima_total: ultF.length, pendentes: res.pendentes.length, saiu_entregue: res.saiuEntregue.length,
      saiu_devolucao: res.saiuDevolucao.length, novas: res.novas.length, mudou_status: res.mudou.length },
    ordem: { so_no_atual: soAtual, so_na_base: soBase, em_ambos: uAll.size - soAtual, linhas_base: bAll.size, linhas_atual: uAll.size,
      possivel_inversao: soAtual > soBase && uAll.size > bAll.size },
    atual, sairam,
    mudou_status: res.mudou.map((m) => ({ awb: m.awb, status_base: m.sb, status_atual: m.su })),
    fora: { base: baseFora.map(contrato), atual: ultFora.map(contrato) },
    nao_recebido_entregue: naoRecebidoComEntrega(ult),
    regras: { por_cidade: porCidade, por_bairro: porBairro, cidades_ignoradas: ignoradas },
    dias_chegada: diasDisponiveis(ultF),
    dias_chegada_entregadores: [...new Set([...diasDisponiveis(baseF), ...diasDisponiveis(ultF)])].sort(),
    desempenho: desempenhoLocal(baseF, ultF, []),
    justificativas: just,
  };
  return { analise, ctx: { baseF, ultF } };
}
