// Tabela dinâmica "Pendentes por data de chegada": linhas = cidade (e, marcando a caixa, entregador,
// bairro, endereço); colunas = dia de chegada ao galpão. Substitui a navegação por faixas (0-1, 2-3 dias).
// A conta (`montarPivot`) é pura e fica separada do desenho para ser testada sem DOM.

type DimPivot = "cidade" | "entregador" | "bairro" | "endereco";
// `ordem`: "nome" (alfabética, como no Excel), "total" (mais peças primeiro) ou o dia de uma coluna (aaaa-mm-dd: mais peças naquele dia primeiro).
interface EstadoPivot { dims: DimPivot[]; datasFora: string[]; fechados: string[]; cel: { caminho: string[]; data: string | null } | null; ordem: string }

const SEM_DATA = "sem-data";
const SEP_PIVOT = "\u0000";
// A ordem desta lista é a hierarquia das linhas: cidade, depois entregador, bairro e endereço.
const DIMS_PIVOT: { id: DimPivot; rotulo: string; valor: (d: Dados) => string }[] = [
  { id: "cidade", rotulo: "Cidade", valor: (d) => textoOu(d["Consignee City"], "(sem cidade)") },
  { id: "entregador", rotulo: "Entregador", valor: (d) => entregadorDe(d) },
  { id: "bairro", rotulo: "Bairro", valor: (d) => textoOu(d["Consignee Area"], "(sem bairro)") },
  { id: "endereco", rotulo: "Endereço", valor: (d) => textoOu(d["Consignee Address"], "(sem endereço)") },
];
const textoOu = (v: Valor | undefined, vazio: string) => (v === null || v === undefined || String(v).trim() === "" ? vazio : String(v).trim());
const dimPivot = (id: DimPivot) => DIMS_PIVOT.find((d) => d.id === id)!;

interface NoPivot { caminho: string[]; rotulo: string; nivel: number; total: number; porData: Map<string, number>; filhos: NoPivot[] }
interface ArvorePivot { datas: string[]; raiz: NoPivot }

function diaChegada(r: RegAtual): string {
  const dt = paraData(r.dados["Arrival Time"]);
  return dt ? diaIso(dt) : SEM_DATA;
}
const ordemDatas = (a: string, b: string) => (a === SEM_DATA ? 1 : b === SEM_DATA ? -1 : a < b ? -1 : a > b ? 1 : 0);

// Dias de chegada presentes, com a contagem de cada um (alimenta as caixas de data).
function diasDoRecorte(regs: RegAtual[]): { dia: string; n: number }[] {
  const m = new Map<string, number>();
  for (const r of regs) { const d = diaChegada(r); m.set(d, (m.get(d) || 0) + 1); }
  return [...m].map(([dia, n]) => ({ dia, n })).sort((x, y) => ordemDatas(x.dia, y.dia));
}

function noVazio(caminho: string[], nivel: number): NoPivot {
  return { caminho, rotulo: caminho.length ? caminho[caminho.length - 1] : "Total Geral", nivel, total: 0, porData: new Map(), filhos: [] };
}

function montarPivot(regs: RegAtual[], dims: DimPivot[], datasFora: Set<string> = new Set(), ordem = "nome"): ArvorePivot {
  const raiz = noVazio([], -1);
  const nos = new Map<string, NoPivot>();
  const datas = new Set<string>();
  for (const r of regs) {
    const dia = diaChegada(r);
    if (datasFora.has(dia)) continue;
    datas.add(dia);
    const soma = (n: NoPivot) => { n.total++; n.porData.set(dia, (n.porData.get(dia) || 0) + 1); };
    soma(raiz);
    let pai = raiz;
    const caminho: string[] = [];
    dims.forEach((dim, i) => {
      caminho.push(dimPivot(dim).valor(r.dados));
      const chave = caminho.join(SEP_PIVOT);
      let no = nos.get(chave);
      if (!no) { no = noVazio([...caminho], i); nos.set(chave, no); pai.filhos.push(no); }
      soma(no); pai = no;
    });
  }
  // Em cada nível, os filhos seguem a ordem escolhida; empate: mais peças no total e, por fim, o nome.
  const peso = (n: NoPivot) => (ordem === "total" ? n.total : n.porData.get(ordem) || 0);
  const porNome = (a: NoPivot, b: NoPivot) => a.rotulo.localeCompare(b.rotulo, "pt-BR");
  const ordenar = (n: NoPivot) => { n.filhos.sort(ordem === "nome" ? porNome : (a, b) => peso(b) - peso(a) || b.total - a.total || porNome(a, b)); n.filhos.forEach(ordenar); };
  ordenar(raiz);
  return { datas: [...datas].sort(ordemDatas), raiz };
}

function casaCelulaPivot(r: RegAtual, cel: EstadoPivot["cel"], dims: DimPivot[]): boolean {
  if (!cel) return true;
  if (cel.data !== null && diaChegada(r) !== cel.data) return false;
  return cel.caminho.every((v, i) => dims[i] !== undefined && dimPivot(dims[i]).valor(r.dados) === v);
}
const rotuloCelulaPivot = (cel: NonNullable<EstadoPivot["cel"]>) =>
  [...cel.caminho, cel.data === null ? "todas as datas" : cel.data === SEM_DATA ? "sem data" : fmtDia(cel.data)].join(" · ");

// Folhas da árvore: uma linha por combinação completa (é o que vai para o Excel).
function folhasPivot(n: NoPivot, dimsN: number): NoPivot[] {
  if (n.nivel === dimsN - 1) return [n];
  return n.filhos.flatMap((f) => folhasPivot(f, dimsN));
}

// Todos os nós que têm filhos (os que podem ser recolhidos), em qualquer nível.
const comFilhos = (n: NoPivot): NoPivot[] => n.filhos.flatMap((f) => (f.filhos.length ? [f, ...comFilhos(f)] : []));

// Dias entre o dia de chegada e o dia da referência (as duas em aaaa-mm-dd...), por calendário.
function idadeEmDias(dia: string, referencia: string): number | null {
  if (dia === SEM_DATA) return null;
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(referencia) - t(dia)) / 86400000);
}
const fmtDiaCurto = (iso: string) => (iso === SEM_DATA ? "Sem data" : `${iso.slice(8, 10)}/${iso.slice(5, 7)}`);
const rotuloIdade = (n: number | null) => (n === null ? "sem data" : n < 0 ? "após a referência" : n === 0 ? "no dia" : n === 1 ? "há 1 dia" : `há ${n} dias`);
const tomIdade = (n: number | null): Tom => (n === null || n < 2 ? "neutro" : n < 4 ? "atencao" : "critico");

// `regs` é o recorte ANTES de excluir datas (as caixas de data precisam mostrar também as excluídas).
// `lista` = id do título da lista que a tabela filtra: ao escolher um número a tela desce até ela (o clique não pode parecer mudo).
function pivotChegada(o: { regs: RegAtual[]; referencia: string; set: (fn: () => void) => void; est: EstadoPivot; lista?: string }): HTMLElement {
  const est = o.est;
  const fora = new Set(est.datasFora);
  const dias = diasDoRecorte(o.regs);
  const arv = montarPivot(o.regs, est.dims, fora, est.ordem);
  const ref = o.referencia.slice(0, 10);
  const colunas = arv.datas;
  const rotuloLinhas = est.dims.map((d) => dimPivot(d).rotulo).join(" › ");
  const fechados = new Set(est.fechados);
  const chave = (n: NoPivot) => n.caminho.join(SEP_PIVOT);
  const celSel = (n: NoPivot, data: string | null) => !!est.cel && est.cel.data === data && est.cel.caminho.join(SEP_PIVOT) === chave(n);

  // Dimensões: caixas que montam a hierarquia (a última ligada não pode ser desligada).
  const caixas = DIMS_PIVOT.map((d) => {
    const ligada = est.dims.includes(d.id);
    return h("label", { class: "pv-dim" + (ligada ? " ativo" : "") },
      h("input", { type: "checkbox", id: "pv-dim-" + d.id, checked: ligada, disabled: ligada && est.dims.length === 1,
        on: { change: () => o.set(() => { est.dims = DIMS_PIVOT.map((x) => x.id).filter((x) => (x === d.id ? !ligada : est.dims.includes(x))); est.cel = null; est.fechados = []; }) } }),
      h("span", null, d.rotulo));
  });

  // Datas: cada caixa liga ou desliga o dia na soma (substitui o "excluir" do Excel).
  const caixasDatas = dias.map(({ dia, n }) => {
    const ligada = !fora.has(dia); const idade = idadeEmDias(dia, ref);
    return h("button", { type: "button", class: "pv-data tom-" + tomIdade(idade) + (ligada ? " ativo" : ""), "aria-pressed": ligada ? "true" : "false",
      title: `${dia === SEM_DATA ? "Sem data de chegada" : fmtDia(dia)} · ${plural(n, "encomenda", "encomendas")} · ${rotuloIdade(idade)}. Clique para ${ligada ? "tirar da soma" : "voltar para a soma"}.`,
      on: { click: () => o.set(() => { est.datasFora = ligada ? [...est.datasFora, dia] : est.datasFora.filter((x) => x !== dia); est.cel = null; }) } },
      h("span", { class: "pv-data-cx", "aria-hidden": "true" }, ligada ? "✓" : ""), fmtDiaCurto(dia), h("small", null, fmtN(n)));
  });

  // Linhas visíveis (respeita o recolhimento).
  const linhas: NoPivot[] = [];
  const visitar = (n: NoPivot) => { for (const f of n.filhos) { linhas.push(f); if (!fechados.has(chave(f))) visitar(f); } };
  visitar(arv.raiz);

  const maiorDoNivel = new Map<number, number>();
  for (const n of linhas) for (const d of colunas) maiorDoNivel.set(n.nivel, Math.max(maiorDoNivel.get(n.nivel) || 0, n.porData.get(d) || 0));
  const celula = (n: NoPivot, dia: string | null) => {
    const v = dia === null ? n.total : n.porData.get(dia) || 0;
    const cls = "num" + (dia === null ? " pv-total" : "");
    if (!v) return h("td", { class: cls + " pv-zero" }, "");
    const td = h("td", { class: cls + (dia === null ? "" : " pv-calor") }, h("button", { type: "button", class: "pv-cel" + (celSel(n, dia) ? " sel" : ""), "aria-pressed": celSel(n, dia) ? "true" : "false",
      title: `${rotuloCelulaPivot({ caminho: n.caminho, data: dia })}: ${plural(v, "encomenda", "encomendas")}. Clique para listar abaixo.`,
      on: { click: () => { const escolhendo = !celSel(n, dia); o.set(() => { est.cel = escolhendo ? { caminho: n.caminho, data: dia } : null; }); if (escolhendo && o.lista) irPara(o.lista); } } }, fmtN(v)));
    if (dia !== null) td.style.setProperty("--calor", Math.sqrt(v / (maiorDoNivel.get(n.nivel) || v)).toFixed(2));
    return td;
  };

  const ordenarPor = (v: string) => () => o.set(() => { est.ordem = v; });
  const seta = (v: string) => (est.ordem === v ? (v === "nome" ? " ▲" : " ▼") : "");
  const ariaOrd = (v: string) => (est.ordem === v ? (v === "nome" ? "ascending" : "descending") : "none");
  const cabData = (dia: string) => { const idade = idadeEmDias(dia, ref);
    return h("th", { class: "num pv-th tom-" + tomIdade(idade), scope: "col", "aria-sort": ariaOrd(dia) },
      h("button", { type: "button", class: "ord pv-ord", title: "Ordenar: mais peças desta data primeiro", on: { click: ordenarPor(dia) } }, h("span", null, fmtDiaCurto(dia) + seta(dia)), h("small", null, rotuloIdade(idade)))); };
  const corpo = linhas.map((n) => {
    const temFilhos = n.filhos.length > 0; const aberto = !fechados.has(chave(n));
    return h("tr", { class: "pv-nivel-" + n.nivel },
      h("th", { scope: "row", class: "pv-rot", style: { paddingLeft: 12 + n.nivel * 18 + "px" } },
        temFilhos ? h("button", { type: "button", class: "pv-abre", "aria-expanded": aberto ? "true" : "false", "aria-label": `${aberto ? "Recolher" : "Expandir"} ${n.rotulo}`,
          on: { click: () => o.set(() => { est.fechados = aberto ? [...est.fechados, chave(n)] : est.fechados.filter((x) => x !== chave(n)); }) } }, aberto ? "▾" : "▸") : h("span", { class: "pv-abre-vazio" }),
        n.rotulo),
      colunas.map((d) => celula(n, d)), celula(n, null));
  });
  const rodape = h("tr", { class: "pv-geral" }, h("th", { scope: "row" }, "Total Geral"), colunas.map((d) => celula(arv.raiz, d)), celula(arv.raiz, null));

  const exportar = botaoExportar("pendentes_por_data_de_chegada.xlsx", () => {
    const cols = [...est.dims.map((d) => dimPivot(d).rotulo), ...colunas.map((d) => (d === SEM_DATA ? "Sem data" : fmtDia(d))), "Total"];
    const linhasX: Dados[] = [...folhasPivot(arv.raiz, est.dims.length), arv.raiz].map((n) => {
      const reg: Dados = {};
      est.dims.forEach((d, i) => { reg[dimPivot(d).rotulo] = n === arv.raiz ? (i === 0 ? "Total Geral" : "") : n.caminho[i]; });
      colunas.forEach((d) => { reg[d === SEM_DATA ? "Sem data" : fmtDia(d)] = n.porData.get(d) || 0; });
      reg["Total"] = n.total; return reg;
    });
    return { linhas: linhasX, colunas: cols };
  }, "Exportar tabela");

  return h("section", { class: "bloco pivot", "aria-labelledby": "pv-tit" },
    h("div", { class: "bloco-cab" },
      h("h2", { id: "pv-tit", class: "fig-tit" }, "Pendentes por data de chegada", explica("pivot_chegada", "pivot")),
      h("span", { class: "pv-ferr" },
        est.dims.length > 1 ? [
          h("button", { type: "button", class: "link", on: { click: () => o.set(() => { est.fechados = []; }) } }, "Expandir tudo"),
          h("button", { type: "button", class: "link", on: { click: () => o.set(() => { est.fechados = comFilhos(arv.raiz).map(chave); }) } }, "Recolher tudo")] : null,
        exportar)),
    h("div", { class: "pv-controles" },
      h("div", { class: "pv-grupo", role: "group", "aria-label": "Detalhar as linhas por" }, h("span", { class: "pv-grupo-rot" }, "Detalhar por"), caixas),
      h("div", { class: "pv-grupo", role: "group", "aria-label": "Datas de chegada somadas" }, h("span", { class: "pv-grupo-rot" }, "Datas de chegada"), caixasDatas,
        est.datasFora.length ? h("button", { type: "button", class: "link", on: { click: () => o.set(() => { est.datasFora = []; est.cel = null; }) } }, "Marcar todas") : null)),
    colunas.length
      ? h("div", { class: "tabela-rolagem" }, h("table", { class: "pv-tabela" },
          h("caption", { class: "sr" }, `Pendentes por ${rotuloLinhas.toLowerCase()} e data de chegada`),
          h("thead", null, h("tr", null,
            h("th", { scope: "col", class: "pv-th-rot", "aria-sort": ariaOrd("nome") }, h("button", { type: "button", class: "ord", title: "Ordenar pelo nome", on: { click: ordenarPor("nome") } }, rotuloLinhas + seta("nome"))),
            colunas.map(cabData),
            h("th", { class: "num pv-th pv-total", scope: "col", "aria-sort": ariaOrd("total") }, h("button", { type: "button", class: "ord", title: "Ordenar: mais peças no total primeiro", on: { click: ordenarPor("total") } }, "Total" + seta("total"))))),
          h("tbody", null, corpo), h("tfoot", null, rodape)))
      : h("p", { class: "grafico-vazio" }, "Nenhuma data marcada: marque ao menos uma data de chegada."),
    h("p", { class: "nota" }, "Clique num número para listar essas encomendas abaixo. A data mostra há quantos dias a encomenda chegou, até ", fmtData(o.referencia), "."));
}
