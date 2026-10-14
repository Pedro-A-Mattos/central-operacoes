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
const PALAVRAS_AVARIA = ["avaria", "danific"];
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

// Datas aceitas: ISO (aaaa-mm-dd[ T]hh:mm[:ss]) e brasileira (dd/mm/aaaa[ hh:mm[:ss]]). Outra coisa = sem data.
// Mesma regra de comparador.para_data (auditoria M-04): nunca se adivinha dia/mês.
const RE_DATA = /^\s*(?:(\d{4})-(\d{2})-(\d{2})|(\d{2})\/(\d{2})\/(\d{4}))(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?\s*$/;
function paraData(v: Valor | undefined): Date | null {
  if (ehNulo(v)) return null;
  const m = RE_DATA.exec(String(v));
  if (!m) return null;
  const ano = +(m[1] || m[6]), mes = +(m[2] || m[5]), dia = +(m[3] || m[4]);
  const hh = +(m[7] || 0), mi = +(m[8] || 0), ss = +(m[9] || 0);
  if (hh > 23 || mi > 59 || ss > 59) return null;
  const d = new Date(ano, mes - 1, dia, hh, mi, ss);
  return Number.isNaN(d.getTime()) || d.getMonth() !== mes - 1 || d.getDate() !== dia ? null : d;
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
  // AWB repetida: vale o registro de evento mais recente; em empate (ou sem datas), a última linha (auditoria M-02).
  const melhor = new Map<string, { pos: number; t: number }>();
  const linhas: Dados[] = [];
  for (const l of t.linhas) {
    const awb = normalizarAwb(l[AWB]);
    if (!awb) continue;
    const r: Dados = { ...l, [AWB]: awb };
    let tt = -Infinity;
    for (const c of COLUNAS_EVENTO) { const d = paraData(r[c]); if (d && d.getTime() > tt) tt = d.getTime(); }
    const ant = melhor.get(awb);
    if (ant && tt < ant.t) continue; // o registro anterior é mais recente
    if (ant) linhas[ant.pos] = null as unknown as Dados;
    melhor.set(awb, { pos: linhas.length, t: tt });
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

// ---------- Estudo / validação por REGIÃO — espelha regras.py ----------
const ZIP = "Consignee Zip Code";
const LIMIAR_REGIAO_PADRAO = 5, MIN_PARTICIPACAO_PADRAO = 0.05, MIN_SUPORTE_PADRAO = 20;
const ERRO_SEM_HISTORICO = "Entregador sem histórico", ERRO_POUCO_HISTORICO = "Região com pouco histórico";

function canonCep(v: Valor | undefined): string | null {
  const s = txt(v);
  if (s === null) return null;
  const d = s.replace(/\D/g, "");
  return d || null;
}
// Chave de comparação de cidade/bairro (espelha regras.canon_chave): sem acento, minúscula, espaços colapsados.
function canonChave(v: Valor | undefined): string | null {
  const s = txt(v);
  if (s === null) return null;
  return s.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/\s+/g, " ").trim() || null;
}
const cmpTxt = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
// Quem atendeu a região: >= limiar entregas E >= minPart do total; o dominante sempre entra.
function conjuntoRegiao(cont: Map<string, number>, limiar: number, minPart: number): string[] {
  let total = 0; for (const n of cont.values()) total += n;
  const dom = [...cont].sort((a, b) => b[1] - a[1] || cmpTxt(a[0], b[0]))[0][0];
  const s = new Set<string>([dom]);
  for (const [e, n] of cont) if (n >= limiar && n / total >= minPart) s.add(e);
  return [...s].sort();
}
const melhorGrafia = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || cmpTxt(a[0], b[0]))[0][0];
function derivarRegiaoLocal(base: Dados[], limiar: number, minPart = MIN_PARTICIPACAO_PADRAO, minSuporte = MIN_SUPORTE_PADRAO): MapaRegiao {
  const mapa: MapaRegiao = { limiar: Math.round(limiar), min_participacao: minPart, min_suporte: Math.round(minSuporte), por_cep: {}, por_bairro: {}, por_cidade: {},
    suporte: { por_cep: {}, por_bairro: {}, por_cidade: {} }, entregadores: [] };
  const cepC = new Map<string, Map<string, number>>(), baiC = new Map<string, Map<string, number>>(), baiG = new Map<string, Map<string, number>>();
  const cidC = new Map<string, Map<string, number>>(), cidG = new Map<string, Map<string, number>>();
  const inc = (m: Map<string, Map<string, number>>, k: string, e: string) => { let x = m.get(k); if (!x) m.set(k, (x = new Map())); x.set(e, (x.get(e) || 0) + 1); };
  const ents = new Set<string>();
  for (const r of base) {
    const e = txt(r[ENTREG]); if (!e) continue;
    ents.add(e);
    const cep = canonCep(r[ZIP]); if (cep) inc(cepC, cep, e);
    const cid = txt(r[CIDADE]), bai = txt(r[AREA]), cc = canonChave(cid);
    if (!cc) continue;
    inc(cidC, cc, e); inc(cidG, cc, cid!);
    const bc = canonChave(bai);
    if (bc) { const k = cc + "|" + bc; inc(baiC, k, e); inc(baiG, k, `${cid}|${bai}`); }
  }
  const soma = (m: Map<string, number>) => { let t = 0; for (const n of m.values()) t += n; return t; };
  for (const c of [...cepC.keys()].sort()) { mapa.por_cep[c] = conjuntoRegiao(cepC.get(c)!, limiar, minPart); mapa.suporte!.por_cep[c] = soma(cepC.get(c)!); }
  const porNome = (cont: Map<string, Map<string, number>>, graf: Map<string, Map<string, number>>) =>
    [...cont.keys()].map((k) => ({ k, nome: melhorGrafia(graf.get(k)!) })).sort((a, b) => cmpTxt(a.nome, b.nome));
  for (const { k, nome } of porNome(baiC, baiG)) { mapa.por_bairro[nome] = conjuntoRegiao(baiC.get(k)!, limiar, minPart); mapa.suporte!.por_bairro[nome] = soma(baiC.get(k)!); }
  for (const { k, nome } of porNome(cidC, cidG)) { mapa.por_cidade[nome] = conjuntoRegiao(cidC.get(k)!, limiar, minPart); mapa.suporte!.por_cidade[nome] = soma(cidC.get(k)!); }
  mapa.entregadores = [...ents].sort();
  return mapa;
}

interface ErroRegiao extends ErroRegiaoReg {}
const ERRO_REG_FORA = "Entregador fora da região", ERRO_REG_SEM_ENT = "Sem entregador", ERRO_REG_SEM_REGRA = "Região sem regra conhecida";
// Índice de consulta com chaves normalizadas (espelha regras._indexar_mapa). Mapas antigos com grafias duplicadas viram a união.
type EntradaIdx = [Set<string>, number | null];
interface IndiceMapa { cep: Map<string, EntradaIdx>; bairro: Map<string, EntradaIdx>; cidade: Map<string, EntradaIdx>; conhecidos: Set<string> | null; minSuporte: number }
function indexarMapa(mapa: MapaRegiao): IndiceMapa {
  const junta = (d: Record<string, string[]> | undefined, sup: Record<string, number> | undefined, fn: (k: string) => string | null) => {
    const out = new Map<string, EntradaIdx>();
    for (const [k, v] of Object.entries(d || {})) {
      const ck = fn(k); if (ck === null) continue;
      const [conj, n] = out.get(ck) || [new Set<string>(), null];
      const sv = sup ? sup[k] : undefined;
      out.set(ck, [new Set([...conj, ...v]), sv === undefined ? n : (n ?? 0) + sv]);
    }
    return out;
  };
  const chaveBairro = (k: string) => { const i = k.indexOf("|"); const cc = canonChave(i < 0 ? k : k.slice(0, i)), bc = canonChave(i < 0 ? "" : k.slice(i + 1)); return cc && bc ? `${cc}|${bc}` : null; };
  const sup = mapa.suporte;
  return { cep: junta(mapa.por_cep, sup?.por_cep, canonCep), bairro: junta(mapa.por_bairro, sup?.por_bairro, chaveBairro), cidade: junta(mapa.por_cidade, sup?.por_cidade, canonChave),
    conhecidos: mapa.entregadores && mapa.entregadores.length ? new Set(mapa.entregadores) : null, minSuporte: Math.round(mapa.min_suporte || 0) };
}
const maiorSup = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));
// CEP e bairro somam (vale quem atende o CEP OU o bairro); a cidade é o último recurso (espelha regras._resolver_regiao).
function resolverRegiao(idx: IndiceMapa, cep: Valor | undefined, bairro: Valor | undefined, cidade: Valor | undefined): { validos: Set<string>; escopo: string; temRegra: boolean; suporte: number | null } {
  const c = canonCep(cep), cc = canonChave(cidade), bc = canonChave(bairro);
  const doCep = c ? idx.cep.get(c) : undefined;
  const doBairro = cc && bc ? idx.bairro.get(`${cc}|${bc}`) : undefined;
  if (doCep && doBairro) return { validos: new Set([...doCep[0], ...doBairro[0]]), escopo: "cep+bairro", temRegra: true, suporte: maiorSup(doCep[1], doBairro[1]) };
  if (doCep) return { validos: new Set(doCep[0]), escopo: "cep", temRegra: true, suporte: doCep[1] };
  if (doBairro) return { validos: new Set(doBairro[0]), escopo: "bairro", temRegra: true, suporte: doBairro[1] };
  const doCid = cc ? idx.cidade.get(cc) : undefined;
  if (doCid) return { validos: new Set(doCid[0]), escopo: "cidade", temRegra: true, suporte: doCid[1] };
  return { validos: new Set(), escopo: "regiao", temRegra: false, suporte: null };
}
function validarRegiaoLocal(rows: Dados[], mapa: MapaRegiao): ErroRegiao[] {
  const idx = indexarMapa(mapa);
  const out: ErroRegiao[] = [];
  for (const r of rows) {
    const { validos, escopo, temRegra } = resolverRegiao(idx, r[ZIP], r[AREA], r[CIDADE]);
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

// Conferência de piso com o MAPA DE REGIÃO (espelha regras.validar_piso_por_regiao). Autoridade: 1) ajuste manual por
// cidade; 2) mapa (CEP e bairro somam, cidade por último). Veredito: fora da área (regra com suporte) > pouco histórico >
// entregador sem histórico (nome ausente do histórico que gerou o mapa: pode ser entregador novo).
function validarPisoPorRegiao(pend: Dados[], mapa: MapaRegiao, ignoradas: string[], ov?: Overrides): Map<string, ErroPiso> {
  const ign = new Set(ignoradas); const out = new Map<string, ErroPiso>();
  const manual = (ov && ov.por_cidade) || {};
  const idx = indexarMapa(mapa);
  for (const r of pend) {
    const c = txt(r[CIDADE]);
    if (c !== null && ign.has(c)) continue;
    const awb = r[AWB] as string;
    const e = txt(r[ENTREG]);
    if (c !== null && Object.prototype.hasOwnProperty.call(manual, c)) {
      const v = [...new Set(manual[c])].sort();
      if (!e) out.set(awb, { tipo: "Sem entregador", detalhe: "Peça sem entregador atribuído.", esperados: v, escopo: "cidade", origem_regra: "ajuste manual" });
      else if (!v.includes(e)) out.set(awb, { tipo: "Entregador fora da área", detalhe: `${e} não está no ajuste manual de ${c}.`, esperados: v, escopo: "cidade", origem_regra: "ajuste manual" });
      continue;
    }
    const { validos, escopo, temRegra, suporte } = resolverRegiao(idx, r[ZIP], r[AREA], r[CIDADE]);
    const esperados = [...validos].sort();
    const esc = escopo as ErroPiso["escopo"];
    if (!temRegra) { out.set(awb, { tipo: "Cidade fora da abrangência", detalhe: "Região (CEP/bairro/cidade) sem regra no mapeamento do estudo.", esperados: [], escopo: esc, origem_regra: "mapa de região" }); continue; }
    if (!e) { out.set(awb, { tipo: "Sem entregador", detalhe: "Peça sem entregador atribuído.", esperados, escopo: esc, origem_regra: "mapa de região" }); continue; }
    if (validos.has(e)) continue;
    if (idx.conhecidos && !idx.conhecidos.has(e))
      out.set(awb, { tipo: ERRO_SEM_HISTORICO, detalhe: `${e} não aparece no histórico que gerou o mapa de região (entregador novo?).`, esperados, escopo: esc, origem_regra: "mapa de região" });
    else if (suporte !== null && idx.minSuporte && suporte < idx.minSuporte)
      out.set(awb, { tipo: ERRO_POUCO_HISTORICO, detalhe: `Região com poucas entregas no histórico (${suporte}); ${e} não está entre quem atendeu.`, esperados, escopo: esc, origem_regra: "mapa de região" });
    else out.set(awb, { tipo: "Entregador fora da área", detalhe: `${e} não costuma atender esta região.`, esperados, escopo: esc, origem_regra: "mapa de região" });
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
  if (entregaConfirmada(r)) return "Entregue"; // confirmada vale mesmo com problema anterior (auditoria H-04)
  if (temValor(r[PROB])) return "Anormal";
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
// Evento mais recente de um relatório (espelha pipeline._ultimo_evento).
function ultimoEvento(linhas: Dados[]): Date | null {
  let max: number | null = null;
  for (const r of linhas) for (const c of COLUNAS_EVENTO) { const d = paraData(r[c]); if (d && (max === null || d.getTime() > max)) max = d.getTime(); }
  return max === null ? null : new Date(max);
}
// Auditoria H-02: a ordem vem das DATAS dos eventos, não do volume (espelha pipeline.indicio_ordem).
function indicioOrdem(base: Dados[], atual: Dados[]): Analise["ordem"] {
  const b = new Set(base.map((r) => r[AWB] as string)), a = new Set(atual.map((r) => r[AWB] as string));
  const soAtual = [...a].filter((x) => !b.has(x)).length, soBase = [...b].filter((x) => !a.has(x)).length;
  const eb = ultimoEvento(base), ea = ultimoEvento(atual);
  const suspeito = eb && ea ? eb.getTime() > ea.getTime() : soAtual > soBase && a.size > b.size;
  return { so_no_atual: soAtual, so_na_base: soBase, em_ambos: a.size - soAtual, linhas_base: b.size, linhas_atual: a.size, possivel_inversao: suspeito,
    evento_base: eb ? dataHoraIso(eb) : null, evento_atual: ea ? dataHoraIso(ea) : null };
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
const ehAvaria = (r: Dados) => PALAVRAS_AVARIA.some((p) => textoProblema(r).includes(p));
// Categoria de uma AWB que SAIU do relatório (espelha pipeline.classificar_saidas; auditoria C-01 e M-01). Precedência: ja_entregue > devolução > ocorrência > provável.
type CatSaida = "provavel_entrega" | "possivel_devolucao" | "ja_entregue" | "saiu_com_ocorrencia";
function categoriaSaida(r: Dados): CatSaida {
  if (entregaConfirmada(r)) return "ja_entregue";
  if (palavraDevolucao(r) || (tresTentativas(r) && !!motivoDevolucao(r))) return "possivel_devolucao";
  if (ehExtravio(r) || ehAvaria(r)) return "saiu_com_ocorrencia";
  return "provavel_entrega";
}
// Já saiu de novo para entrega depois da ocorrência (espelha metricas.reroteada).
const reroteada = (r: Dados) => {
  if (!temValor(r[PROB])) return false;
  const saida = paraData(r[DELIV_TIME]), ocorrencia = paraData(r["Last Problem Date"]);
  return !!saida && !!ocorrencia && saida.getTime() > ocorrencia.getTime();
};
const ehInsucesso = (r: Dados) => temValor(r[PROB]) && (contagem(r) ?? 0) < LIMITE_TENTATIVAS && !ehExtravio(r);

// Progresso por entregador sobre as peças ABERTAS (espelha metricas.desempenho_progresso; auditoria C-01, decisão D1).
function desempenhoLocal(baseF: Dados[], ultF: Dados[], dias: string[]): Desempenho {
  const b = filtrarDias(baseF, dias), u = filtrarDias(ultF, dias);
  const noUlt = new Map(u.map((r) => [r[AWB] as string, r]));
  const grupos = new Map<string, Dados[]>();
  for (const r of b) { const e = ehNulo(r[ENTREG]) ? SEM_ENTREGADOR : String(r[ENTREG]); if (!grupos.has(e)) grupos.set(e, []); grupos.get(e)!.push(r); }
  const linhas: LinhaDesempenho[] = []; const awbs: Desempenho["awbs"] = {};
  for (const [e, g] of [...grupos].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const cls: Record<string, string[]> = {};
    let ent = 0, an = 0, tr = 0, pe = 0, ja = 0;
    const marca = (classe: string, a: string) => { (cls[classe] ||= []).push(a); };
    for (const r of g) {
      const a = r[AWB] as string;
      if (entregaConfirmada(r)) { ja++; continue; }
      const nu = noUlt.get(a);
      if (nu) {
        if (entregaConfirmada(nu)) { ent++; marca("Entregue", a); }
        else if (temValor(nu[PROB])) { if (reroteada(nu)) { tr++; marca("Tratada", a); } else { an++; marca("Anormal", a); } }
        else { pe++; marca("Pendente", a); }
      } else if (categoriaSaida(r) === "provavel_entrega") { ent++; marca("Entregue", a); }
    }
    const total = g.length - ja;
    linhas.push({ entregador: e, total, entregue: ent, anormal: an, tratada: tr, pendente: pe, pct_entregue: total ? Math.round((1000 * ent) / total) / 10 : 0, ja_entregues: ja });
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
  if (info.duplicadas) avisos.push(`${info.duplicadas} código(s) repetido(s): será mantido o registro de evento mais recente de cada um (em empate, a última linha).`);
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
  const colsData = norm.length ? COLUNAS_EVENTO.filter((c) => c in norm[0]) : [];
  add("datas_invalidas", "datas em formato não reconhecido", colsData.reduce((s, c) => s + norm.filter((r) => temValor(r[c]) && !paraData(r[c])).length, 0),
    "Ficam sem data: afetam faixas de espera, tempo em rota e a data de referência. Aceitos: aaaa-mm-dd hh:mm:ss e dd/mm/aaaa hh:mm.");
  add("sem_entregador", "linhas com cidade e sem entregador", norm.filter((r) => comCidade(r) && !temValor(r[ENTREG])).length, "Aparecem como “Sem entregador” na conferência de piso.");
  add("sem_bairro", "linhas com cidade e sem bairro", norm.filter((r) => comCidade(r) && !temValor(r[AREA])).length, "Nas cidades conferidas por bairro, são conferidas pela regra da cidade.", [], "info");
  add("entregue_confirmada", "encomendas já constam como entregues", norm.filter(entregaConfirmada).length, "Se este for o relatório atualizado, elas seguem contadas como pendentes (regra RN-003).", [], "info");
  return out;
}

// Simulação de mudança de regra (espelha pipeline.simular_regras).
function simularRegrasLocal(baseF: Dados[], ultF: Dados[], atual: ConfigRegras, novo: ConfigRegras): Simulacao {
  const erros = (c: ConfigRegras) => {
    const ov = c.overrides || { por_cidade: {}, cidades_ignoradas: [] };
    const ign = [...new Set([...(ov.cidades_ignoradas || []), ...(c.cidades_ignoradas || [])])];
    const mp = c.mapa_regiao;
    const m = new Map<string, string>();
    // mesmo validador do resultado real: a simulação não pode prever outra coisa (auditoria H-01)
    if (mp && (Object.keys(mp.por_cep).length || Object.keys(mp.por_bairro).length || Object.keys(mp.por_cidade).length)) {
      for (const [k, v] of validarPisoPorRegiao(ultF, mp, ign, ov)) m.set(k, v.tipo);
      return m;
    }
    const rg = aplicarOverrides(derivarRegras(baseF, Math.round(c.limiar_ruido || LIMIAR_RUIDO_PADRAO)), ov);
    for (const [k, v] of validarPiso(ultF, rg, ign)) m.set(k, v.tipo); return m;
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

// Filtros globais SIMÉTRICOS (espelha pipeline.filtrar_relatorios; auditoria H-03): uma peça retirada de um
// relatório (descarregado, não recebido, FM, sem cidade) também sai do outro.
function filtrarRelatorios(base: Dados[], ult: Dados[], ignDesc: boolean, ignNr: boolean) {
  const b1 = filtroDescarregado(base, ignDesc), u1 = filtroDescarregado(ult, ignDesc);
  const b1b = filtroNaoRecebido(b1, ignNr), u1b = filtroNaoRecebido(u1, ignNr);
  const b2 = removerFm(b1b), u2 = removerFm(u1b);
  const [bF, baseFora] = separarFora(b2), [uF, ultFora] = separarFora(u2);
  const ids = (df: Dados[]) => new Set(df.map((r) => r[AWB] as string));
  const idsBF = ids(bF), idsUF = ids(uF);
  const excluir = new Set<string>([...ids(base)].filter((x) => !idsBF.has(x)).concat([...ids(ult)].filter((x) => !idsUF.has(x))));
  const baseF = bF.filter((r) => !excluir.has(r[AWB] as string)), ultF = uF.filter((r) => !excluir.has(r[AWB] as string));
  const cruzadasIds = [...new Set([...bF.filter((r) => excluir.has(r[AWB] as string)), ...uF.filter((r) => excluir.has(r[AWB] as string))].map((r) => r[AWB] as string))].sort();
  return { b1, u1, b1b, u1b, b2, u2, baseF, ultF, baseFora, ultFora, cruzadasBase: bF.length - baseF.length, cruzadasAtual: uF.length - ultF.length, cruzadasIds };
}

function analisarLocal(tb: Tabela, tu: Tabela, p: ParametrosAnalise, ov: Overrides,
  just: Record<string, Justificativa>, nomes: [string, string]): { analise: Analise; ctx: ContextoLocal } {
  const base = normalizarRelatorio(tb), ult = normalizarRelatorio(tu);
  let ref: Date | null = null, refOrigem: OrigemReferencia = "relogio";
  if (p.referencia_backlog && paraData(p.referencia_backlog)) { ref = paraData(p.referencia_backlog); refOrigem = "definida"; }
  else [ref, refOrigem] = referenciaDoRelatorio(nomes[1], ult);
  if (!ref) { ref = new Date(); ref.setMilliseconds(0); refOrigem = "relogio"; }
  const refFinal: Date = ref;
  const { b1, u1, b1b, u1b, b2, u2, baseF, ultF, baseFora, ultFora, cruzadasBase, cruzadasAtual, cruzadasIds } = filtrarRelatorios(base, ult, p.ignorar_descarregado, p.ignorar_nao_recebido);
  const res = comparar(baseF, ultF);
  const limiar = Math.max(1, Math.min(20, Math.round(p.limiar_ruido || LIMIAR_RUIDO_PADRAO)));
  const rg = aplicarOverrides(derivarRegras(baseF, limiar), ov);
  const ignoradas = [...new Set([...(ov.cidades_ignoradas || []), ...(p.cidades_ignoradas || [])])];
  const erros = p.mapa_regiao ? validarPisoPorRegiao(res.pendentes, p.mapa_regiao, ignoradas, ov) : validarPiso(res.pendentes, rg, ignoradas);

  const bIds = new Set(baseF.map((r) => r[AWB] as string));
  const bMap = new Map(baseF.map((r) => [r[AWB] as string, r]));
  const mudouSet = new Set(res.mudou.map((m) => m.awb));
  const ids = (df: Dados[]) => new Set(df.map((r) => r[AWB] as string));
  const diff = (a: Dados[], b: Dados[]) => { const s = ids(b); return a.map((r) => r[AWB] as string).filter((x) => !s.has(x)); };

  const atual: RegAtual[] = res.pendentes.map((r) => {
    const a = r[AWB] as string; const dias = backlogDias(r, refFinal); const rota = minutosEmRota(r, refFinal);
    const ex: TipoExcecao[] = [];
    if (ehDevolucao(r)) ex.push("devolucao"); if (ehExtravio(r)) ex.push("extravio"); if (ehInsucesso(r)) ex.push("insucesso"); if (ehRevisar(r)) ex.push("revisar_tentativas"); if (ehAvaria(r) && !ehExtravio(r)) ex.push("avaria");
    const naBase = bIds.has(a);
    const sb = naBase ? bMap.get(a)![STATUS] : null; const eb = naBase ? bMap.get(a)![ENTREG] : null;
    return {
      dados: contrato(r), nova: !naBase, classe_operacional: classificar(r),
      backlog_dias: dias === null ? null : Math.round(dias * 100) / 100, faixa_backlog: faixaDe(dias),
      em_rota_min: rota, entrega_confirmada: entregaConfirmada(r), reroteada: reroteada(r), motivo_devolucao: motivoDevolucao(r),
      status_base: ehNulo(sb) ? null : sb ?? null, mudou_status: mudouSet.has(a),
      entregador_base: ehNulo(eb) ? null : eb ?? null, erro_piso: erros.get(a) || null, excecoes: ex,
    };
  });
  const idsUlt = new Set(ultF.map((r) => r[AWB] as string));
  const sairam: RegSaiu[] = baseF.filter((r) => !idsUlt.has(r[AWB] as string)).map((r) => {
    const categoria = categoriaSaida(r);
    return { dados: contrato(r), categoria, indicio: palavraDevolucao(r) || (categoria === "possivel_devolucao" ? motivoDevolucao(r) : null) };
  });
  const nCat = (c: CatSaida) => sairam.filter((x) => x.categoria === c).length;
  const porCidade: Analise["regras"]["por_cidade"] = {};
  for (const c of [...rg.porCidade.keys()].sort()) porCidade[c] = { entregadores: [...rg.porCidade.get(c)!].sort(), origem: rg.origem.get(c) || "derivada", urbana: rg.urbanas.has(c) };
  const porBairro = [...rg.porBairro].map(([k, v]) => { const [cidade, bairro] = k.split("\u0000"); return { cidade, bairro, entregadores: [...v].sort() }; })
    .sort((x, y) => (x.cidade + x.bairro < y.cidade + y.bairro ? -1 : 1));

  const analise: Analise = {
    versao: 2, motor: "local", gerado_em: dataHoraIso(new Date()).replace(" ", "T"), referencia_backlog: dataHoraIso(refFinal),
    referencia_origem: refOrigem, entregues_confirmadas: res.pendentes.filter(entregaConfirmada).length,
    arquivos: { base: nomes[0], atual: nomes[1] },
    parametros: { ignorar_descarregado: p.ignorar_descarregado, ignorar_nao_recebido: p.ignorar_nao_recebido, limiar_ruido: limiar, min_entregadores_urbano: MIN_URBANO, limite_tentativas: LIMITE_TENTATIVAS, cidades_ignoradas: ignoradas, motivos_devolucao: [...MOTIVOS_DEVOLUCAO] },
    etapas: { base_lidas: base.length, atual_lidas: ult.length, descarregado_base: base.length - b1.length, descarregado_atual: ult.length - u1.length,
      nao_recebido_base: b1.length - b1b.length, nao_recebido_atual: u1.length - u1b.length,
      fm_base: b1b.length - b2.length, fm_atual: u1b.length - u2.length, fora_base: baseFora.length, fora_atual: ultFora.length,
      cruzadas_base: cruzadasBase, cruzadas_atual: cruzadasAtual },
    removidas: { fm: [...new Set([...diff(b1b, b2), ...diff(u1b, u2)])].sort(), descarregado: [...new Set([...diff(base, b1), ...diff(ult, u1)])].sort(),
      nao_recebido: [...new Set([...diff(b1, b1b), ...diff(u1, u1b)])].sort(), cruzadas: cruzadasIds },
    resumo: { base_total: baseF.length, ultima_total: ultF.length, pendentes: res.pendentes.length, saiu_entregue: nCat("provavel_entrega"),
      saiu_devolucao: nCat("possivel_devolucao"), novas: res.novas.length, mudou_status: res.mudou.length, saiu_ja_entregue: nCat("ja_entregue"), saiu_com_ocorrencia: nCat("saiu_com_ocorrencia") },
    ordem: indicioOrdem(base, ult),
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
