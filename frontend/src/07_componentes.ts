// Componentes reutilizáveis. Todos devolvem HTMLElement.

// ---------- cabeçalho de tela: Pergunta → Resposta → Ação ----------
function cabecalho(o: { area: string; titulo: string; pergunta: string; resposta?: Filho; acoes?: Filho; ajuda?: string }): HTMLElement {
  return h("header", { class: "cab" },
    E.origem ? h("button", { class: "voltar", type: "button", on: { click: () => navegar(E.origem!.tela) } }, icone("voltar"), "Voltar para ", E.origem.rotulo) : null,
    h("div", { class: "cab-linha" },
      h("div", { class: "cab-texto" },
        h("p", { class: "sobretitulo" }, o.area),
        h("div", { class: "titulo-linha" }, h("h1", { id: "titulo-tela", tabindex: "-1" }, o.titulo), o.ajuda ? explica(o.ajuda, "cab") : null),
        h("p", { class: "pergunta" }, o.pergunta)),
      o.acoes ? h("div", { class: "cab-acoes" }, o.acoes) : null),
    o.resposta ? h("div", { class: "resposta" }, o.resposta) : null);
}

// ---------- ajuda contextual ----------
function ajuda(texto: string): HTMLElement {
  return h("span", { class: "dica", tabindex: "0", role: "note", "aria-label": texto, "data-dica": texto }, icone("info", "ic ic-sm"));
}

// ---------- selos de procedência e estado ----------
type Selo = "inferido" | "relatorio" | "derivada" | "manual" | "proposta" | "pendente" | "navegador";
const SELOS: Record<Selo, [string, string]> = {
  inferido: ["Inferido", "Calculado por ausência no relatório atualizado ou por palavra-chave. Não é confirmação de entrega."],
  relatorio: ["Do relatório", "Valor lido diretamente do relatório Dispatch."],
  derivada: ["Regra derivada", "Aprendida do histórico do relatório base (quem entregou onde). Não é cadastro oficial."],
  manual: ["Ajuste manual", "Regra definida por uma pessoa; tem prioridade sobre a derivada."],
  proposta: ["Proposta", "Sugestão de evolução, ainda não aprovada nem implementada."],
  pendente: ["Decisão pendente", "Regra mantida como no MVP até uma decisão de negócio."],
  navegador: ["Só neste navegador", "Salvo apenas neste navegador."],
};
function selo(t: Selo, texto?: string): HTMLElement {
  const [r, d] = SELOS[t];
  return h("span", { class: "selo selo-" + t, title: d }, t === "inferido" ? icone("inferido", "ic ic-xs") : null, texto || r);
}

type Tom = "critico" | "atencao" | "ok" | "neutro" | "inferido" | "info";
function chip(texto: string, tom: Tom = "neutro", ic?: string): HTMLElement {
  return h("span", { class: "chip chip-" + tom }, ic ? icone(ic, "ic ic-xs") : null, texto);
}
const TOM_ERRO: Record<string, Tom> = { "Entregador fora da área": "critico", "Sem entregador": "atencao", "Cidade fora da abrangência": "critico", "Cidade ausente": "atencao", "Entregador sem histórico": "atencao", "Região com pouco histórico": "atencao" };
const ROTULO_EXC: Record<TipoExcecao, string> = { devolucao: "Devolução", extravio: "Extravio", insucesso: "Insucesso", revisar_tentativas: "3+ tentativas, revisar" };
const TOM_EXC: Record<TipoExcecao, Tom> = { devolucao: "critico", extravio: "critico", insucesso: "atencao", revisar_tentativas: "atencao" };
// "regra do CEP", "regra do bairro"... conforme o escopo que decidiu a conferência.
const ROTULO_ESCOPO: Record<string, string> = { cep: "do CEP", bairro: "do bairro", "cep+bairro": "do CEP e do bairro", cidade: "da cidade" };
const TOM_FAIXA: Record<string, Tom> = { "0-1 dia": "ok", "2-3 dias": "atencao", "4+ dias": "critico" };
const TOM_CLASSE: Record<string, Tom> = { "Entregue": "ok", "Não entregue": "neutro", "Anormal": "atencao" };
const chipErro = (t: string) => chip(t, TOM_ERRO[t] || "neutro", TOM_ERRO[t] === "critico" ? "critico" : "alerta");
const chipFaixa = (f: string | null) => (f ? chip(f, TOM_FAIXA[f], "relogio") : chip("Sem data", "neutro"));

// ---------- KPI ----------
function kpi(o: { rotulo: string; valor: number | string; nota: string; tom?: Tom; selo?: Selo; destino?: () => void; id?: string; ajuda?: string }): HTMLElement {
  const cls = "kpi" + (o.tom ? " kpi-" + o.tom : "") + (o.destino ? " clicavel" : "");
  return h("div", { class: cls, id: o.id, on: o.destino ? { click: (e: Event) => { if ((e.target as HTMLElement).closest(".ajuda, button")) return; o.destino!(); } } : undefined },
    h("span", { class: "kpi-rotulo" }, o.rotulo, o.selo ? selo(o.selo) : null, o.ajuda ? explica(o.ajuda, "kpi") : null),
    h("span", { class: "kpi-valor" }, typeof o.valor === "number" ? fmtN(o.valor) : o.valor),
    h("span", { class: "kpi-nota" }, o.nota),
    o.destino ? h("button", { type: "button", class: "kpi-ir", "aria-label": `Ver registros: ${o.rotulo}`, on: { click: o.destino } }, "Ver registros", icone("seta", "ic ic-xs")) : null);
}

// ---------- estado vazio ----------
function vazio(titulo: string, texto: string, acao?: Filho, tom: "ok" | "neutro" = "neutro"): HTMLElement {
  return h("div", { class: "vazio vazio-" + tom }, icone(tom === "ok" ? "ok" : "info", "ic ic-lg"), h("strong", null, titulo), h("p", null, texto), acao || null);
}

// ---------- gráfico de barras horizontais clicáveis ----------
const MOSTRAR_TODOS = new Set<string>();
interface ItemBarra { rotulo: string; valor: number; chave?: string; tom?: Tom }
function barras(o: {
  id: string; titulo: string; descricao: string; unidade: [string, string]; itens: ItemBarra[];
  selecionado?: string | null; onSelecionar?: (it: ItemBarra | null) => void; max?: number; legenda?: Filho; vazio?: string; ajuda?: string;
}): HTMLElement {
  const max = o.max ?? 10;
  const todos = MOSTRAR_TODOS.has(o.id);
  const itens = todos ? o.itens : o.itens.slice(0, max);
  const maior = Math.max(1, ...o.itens.map((i) => i.valor));
  const total = o.itens.reduce((s, i) => s + i.valor, 0);
  const lista = h("ol", { class: "barras", "aria-label": o.titulo });
  for (const it of itens) {
    const k = it.chave ?? it.rotulo;
    const sel = o.selecionado === k;
    const conteudo = [
      h("span", { class: "barra-rotulo", title: it.rotulo }, it.rotulo),
      h("span", { class: "barra-trilho" }, h("span", { class: "barra-preench tom-" + (it.tom || "acento"), style: { width: (100 * it.valor) / maior + "%" } })),
      h("span", { class: "barra-valor" }, fmtN(it.valor)),
    ];
    const titulo = `${it.rotulo}: ${plural(it.valor, o.unidade[0], o.unidade[1])} (${fmtPct((100 * it.valor) / (total || 1))} do total)`;
    lista.appendChild(h("li", null, o.onSelecionar
      ? h("button", { type: "button", class: "barra" + (sel ? " sel" : "") + (o.selecionado && !sel ? " esmaecida" : ""), "aria-pressed": sel ? "true" : "false", title: titulo + (sel ? " — clique para limpar a seleção" : " — clique para ver as encomendas"), on: { click: () => o.onSelecionar!(sel ? null : it) } }, conteudo)
      : h("div", { class: "barra", title: titulo }, conteudo)));
  }
  return h("figure", { class: "grafico", id: "g-" + o.id },
    h("figcaption", null, h("span", { class: "fig-tit" }, h("strong", null, o.titulo), o.ajuda ? explica(o.ajuda, "g-" + o.id) : null), h("span", null, o.descricao)),
    o.itens.length ? lista : h("p", { class: "grafico-vazio" }, o.vazio || "Nenhuma encomenda neste recorte."),
    o.itens.length > max ? h("button", { type: "button", class: "link", on: { click: () => { todos ? MOSTRAR_TODOS.delete(o.id) : MOSTRAR_TODOS.add(o.id); renderizar(); } } }, todos ? "Mostrar só os principais" : `Mostrar todos (${o.itens.length})`) : null,
    o.legenda ? h("div", { class: "grafico-legenda" }, o.legenda) : null);
}

// ---------- rosca (composição de um todo; a legenda é a parte acessível por teclado) ----------
interface SegRosca { id: string; rotulo: string; valor: number; tom: string; ajuda?: string }
function rosca(o: { id: string; titulo: string; descricao?: string; segmentos: SegRosca[]; centro: { valor: string; rotulo: string };
  selecionado?: string | null; onSelecionar?: (id: string | null) => void; ajuda?: string; unidade?: [string, string] }): HTMLElement {
  const total = o.segmentos.reduce((s, x) => s + x.valor, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  let acum = 0;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 140 140"); svg.setAttribute("class", "rosca-svg"); svg.setAttribute("aria-hidden", "true");
  const fundo = document.createElementNS(svg.namespaceURI, "circle");
  fundo.setAttribute("cx", "70"); fundo.setAttribute("cy", "70"); fundo.setAttribute("r", String(R)); fundo.setAttribute("class", "rosca-fundo");
  svg.appendChild(fundo);
  for (const s of o.segmentos) {
    if (!s.valor) continue;
    const len = (s.valor / total) * C;
    const c = document.createElementNS(svg.namespaceURI, "circle");
    c.setAttribute("cx", "70"); c.setAttribute("cy", "70"); c.setAttribute("r", String(R));
    c.setAttribute("class", "rosca-seg seg-" + s.tom + (o.selecionado && o.selecionado !== s.id ? " esmaecido" : "") + (o.selecionado === s.id ? " sel" : ""));
    c.setAttribute("stroke-dasharray", `${Math.max(0, len - 1.5)} ${C}`);
    c.setAttribute("stroke-dashoffset", String(-acum));
    c.setAttribute("transform", "rotate(-90 70 70)");
    if (o.onSelecionar) c.addEventListener("click", () => o.onSelecionar!(o.selecionado === s.id ? null : s.id));
    const t = document.createElementNS(svg.namespaceURI, "title"); t.textContent = `${s.rotulo}: ${s.valor} (${fmtPct((100 * s.valor) / total)})`; c.appendChild(t);
    svg.appendChild(c); acum += len;
  }
  const un = o.unidade || ["encomenda", "encomendas"];
  return h("figure", { class: "grafico rosca", id: "r-" + o.id },
    h("figcaption", null, h("span", { class: "fig-tit" }, h("strong", null, o.titulo), o.ajuda ? explica(o.ajuda, "r-" + o.id) : null), o.descricao ? h("span", null, o.descricao) : null),
    h("div", { class: "rosca-corpo" },
      h("div", { class: "rosca-graf" }, svg, h("div", { class: "rosca-centro" }, h("strong", null, o.centro.valor), h("span", null, o.centro.rotulo))),
      h("ul", { class: "rosca-leg" }, o.segmentos.map((s) => {
        const sel = o.selecionado === s.id;
        const conteudo = [h("i", { class: "tom-" + s.tom }), h("span", { class: "rl-rot" }, s.rotulo), h("strong", null, fmtN(s.valor)), h("small", null, fmtPct((100 * s.valor) / total))];
        return h("li", null, o.onSelecionar && s.valor
          ? h("button", { type: "button", class: "rl" + (sel ? " sel" : ""), "aria-pressed": sel ? "true" : "false", title: `${plural(s.valor, un[0], un[1])} — clique para destacar`, on: { click: () => o.onSelecionar!(sel ? null : s.id) } }, conteudo)
          : h("div", { class: "rl" }, conteudo), s.ajuda ? explica(s.ajuda, o.id + "-" + s.id) : null);
      }))));
}

// ---------- seleção múltipla (filtro) ----------
const MS_ABERTO = { id: "" };
function multi(o: { id: string; rotulo: string; opcoes: string[]; valores: string[]; onMudar: (v: string[]) => void; formatar?: (s: string) => string; descricao?: string; ajuda?: string }): HTMLElement {
  const fmt = o.formatar || ((s: string) => s);
  const resumo = o.valores.length === 0 ? "Todos" : o.valores.length === 1 ? fmt(o.valores[0]) : `${o.valores.length} selecionados`;
  const det = h("details", { class: "ms" + (o.valores.length ? " ativo" : ""), id: "ms-" + o.id }) as HTMLDetailsElement;
  det.open = MS_ABERTO.id === o.id;
  det.addEventListener("toggle", () => { if (det.open) MS_ABERTO.id = o.id; else if (MS_ABERTO.id === o.id) MS_ABERTO.id = ""; });
  const lista = h("div", { class: "ms-lista", role: "group", "aria-label": o.rotulo });
  const busca = o.opcoes.length > 8 ? h("input", { type: "search", class: "ms-busca", id: "ms-busca-" + o.id, placeholder: "Filtrar opções", "aria-label": "Filtrar opções de " + o.rotulo,
    on: { input: (e: Event) => { const q = normalizarBusca((e.target as HTMLInputElement).value); lista.querySelectorAll("label").forEach((l) => { (l as HTMLElement).hidden = !normalizarBusca(l.textContent || "").includes(q); }); } } }) : null;
  o.opcoes.forEach((op, i) => {
    const marcado = o.valores.includes(op);
    lista.appendChild(h("label", { class: "ms-op" },
      h("input", { type: "checkbox", id: `ms-${o.id}-${i}`, checked: marcado, on: { change: () => o.onMudar(marcado ? o.valores.filter((v) => v !== op) : [...o.valores, op]) } }),
      h("span", null, fmt(op))));
  });
  det.append(
    h("summary", { "aria-label": `${o.rotulo}: ${resumo}` }, h("span", { class: "ms-rot" }, o.rotulo), h("span", { class: "ms-val" }, resumo)),
    h("div", { class: "ms-pop" }, o.descricao ? h("p", { class: "ms-desc" }, o.descricao) : null, busca, lista,
      o.valores.length ? h("button", { type: "button", class: "link", on: { click: () => o.onMudar([]) } }, "Limpar este filtro") : null));
  return o.ajuda ? h("span", { class: "ms-com-ajuda" }, det, explica(o.ajuda, "f-" + o.id)) : det;
}

function alternar(o: { id: string; rotulo: string; valor: boolean; onMudar: (v: boolean) => void; dica?: string; ajuda?: string }): HTMLElement {
  const lab = h("label", { class: "alternar" + (o.valor ? " ativo" : "") },
    h("input", { type: "checkbox", role: "switch", id: o.id, checked: o.valor, on: { change: (e: Event) => o.onMudar((e.target as HTMLInputElement).checked) } }),
    h("span", { class: "alternar-trilho", "aria-hidden": "true" }), h("span", null, o.rotulo), o.dica && !o.ajuda ? ajuda(o.dica) : null);
  return o.ajuda ? h("span", { class: "ms-com-ajuda" }, lab, explica(o.ajuda, "a-" + o.id)) : lab;
}

// ---------- barra de filtros com chips ativos ----------
interface ChipFiltro { texto: string; remover: () => void }
function barraFiltros(controles: Filho, ativos: ChipFiltro[], limpar: () => void, nota?: string): HTMLElement {
  return h("section", { class: "filtros", "aria-label": "Filtros desta tela" },
    h("div", { class: "filtros-controles" }, icone("filtro", "ic ic-sm filtros-ic"), controles),
    ativos.length ? h("div", { class: "filtros-ativos" },
      h("span", { class: "filtros-rot" }, "Mostrando:"),
      ativos.map((a) => h("button", { type: "button", class: "chip-filtro", "aria-label": `Remover filtro ${a.texto}`, on: { click: a.remover } }, a.texto, icone("fechar", "ic ic-xs"))),
      h("button", { type: "button", class: "link", on: { click: limpar } }, "Limpar filtros")) : null,
    nota ? h("p", { class: "filtros-nota" }, nota) : null);
}

// ---------- abas segmentadas ----------
function abas<T extends string>(id: string, itens: { id: T; rotulo: string; n?: number; tom?: Tom }[], atual: T, onMudar: (v: T) => void): HTMLElement {
  return h("div", { class: "abas", role: "tablist", id: "abas-" + id },
    itens.map((it) => h("button", { type: "button", role: "tab", id: `aba-${id}-${it.id}`, "aria-selected": it.id === atual ? "true" : "false", class: "aba" + (it.id === atual ? " sel" : ""),
      on: { click: () => onMudar(it.id), keydown: (e: KeyboardEvent) => {
        const i = itens.findIndex((x) => x.id === it.id);
        const j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : -9;
        if (j >= 0 && j < itens.length) { e.preventDefault(); onMudar(itens[j].id); setTimeout(() => document.getElementById(`aba-${id}-${itens[j].id}`)?.focus()); }
      } } }, it.rotulo, it.n !== undefined ? h("span", { class: "aba-n" + (it.tom && it.n ? " tom-" + it.tom : "") }, fmtN(it.n)) : null)));
}

// ---------- exportação ----------
// Se `idTabela` for informado, o arquivo reflete também os filtros de coluna e a
// busca livre aplicados naquela tabela na tela (comportamento estilo Metabase).
function botaoExportar(nome: string, gerar: () => { linhas: Dados[]; colunas: string[] }, rotulo = "Exportar Excel", idTabela?: string): HTMLElement {
  return h("button", { type: "button", class: "btn btn-sec", title: "Planilha Excel (.xlsx) com os nomes de coluna originais do relatório", on: { click: async () => {
    const r0 = gerar();
    const filtro = idTabela ? RECORTE_TABELA.get(idTabela) : undefined;
    const linhas = filtro ? r0.linhas.filter(filtro) : r0.linhas;
    if (!linhas.length) { aviso("Não há registros para exportar neste recorte.", "info"); return; }
    const r = await salvarArquivo(nome, xlsx(linhas, r0.colunas));
    if (r === "salvo") aviso(`${plural(linhas.length, "registro exportado", "registros exportados")} em ${nome}.`);
    else if (r === "erro") aviso("Não foi possível gerar o arquivo neste ambiente. Tente novamente.", "erro");
  } } }, icone("baixar", "ic ic-sm"), rotulo);
}

// ---------- tabela operacional ----------
interface Coluna<T> { id: string; rotulo: string; valor: (r: T) => string | number | null; render?: (r: T) => Filho; classe?: string; ordenavel?: boolean }
interface EstadoTab { col: string; dir: 1 | -1; pagina: number; busca: string; filtros: Record<string, Set<string>> }
const TAB = new Map<string, EstadoTab>();

// Predicado do recorte visível (busca + filtros de coluna) publicado por id de
// tabela, para o botão de exportar baixar exatamente o que está na tela.
const RECORTE_TABELA = new Map<string, (d: Dados) => boolean>();

function tabela<T>(o: {
  id: string; colunas: Coluna<T>[]; linhas: T[]; chave: (r: T) => string; onAbrir?: (r: T) => void; porPagina?: number;
  ordemInicial?: { col: string; dir: 1 | -1 }; exportar?: Filho; vazio?: HTMLElement; titulo?: string;
  selecao?: { marcados: Set<string>; onMudar: () => void; acoes: (n: number) => Filho };
}): HTMLElement {
  const st = TAB.get(o.id) || { col: o.ordemInicial?.col || "", dir: o.ordemInicial?.dir || 1, pagina: 0, busca: "", filtros: {} };
  if (!st.filtros) st.filtros = {};
  TAB.set(o.id, st);
  const porPagina = o.porPagina || 25;
  const raiz = h("div", { class: "tabela-bloco", id: "t-" + o.id });
  const corpo = h("div", { class: "tabela-corpo" });

  // Aplica busca livre + filtros de coluna (valores desmarcados ficam de fora).
  const recortar = (): T[] => o.linhas.filter((r) => passaRecorte(r, o.colunas, st.busca, st.filtros));

  // Popover de coluna: ordenar + lista de valores distintos com checkboxes.
  // Fecha o popover aberto (só um por vez) e reabre no botão clicado.
  const fecharMenus = () => raiz.querySelectorAll(".col-menu").forEach((m) => m.remove());

  function botaoMenuColuna(c: Coluna<T>, temFiltro: boolean): HTMLElement {
    const abrir = (btn: HTMLElement) => {
      const jaAberto = btn.parentElement?.querySelector(".col-menu");
      fecharMenus();
      if (jaAberto) return; // segundo clique fecha

      // valores distintos desta coluna, considerando o recorte das OUTRAS colunas
      const outras = o.colunas.filter((x) => x.id !== c.id);
      const semEsta = o.linhas.filter((r) => passaRecorte(r, outras, "", st.filtros));
      const distintos = distintosDe(semEsta, c.valor);
      const excluidos = st.filtros[c.id] || new Set<string>();

      const rotuloValor = (v: string) => v === "" ? (VAZIO[c.id] || "(vazio)") : v;
      const lista = h("div", { class: "col-menu-lista" });
      const redesenharLista = () => {
        lista.innerHTML = "";
        distintos.forEach((v) => {
          const marcado = !excluidos.has(v);
          lista.appendChild(h("label", { class: "col-menu-item" },
            h("input", { type: "checkbox", checked: marcado, on: { change: (e: Event) => {
              if ((e.target as HTMLInputElement).checked) excluidos.delete(v); else excluidos.add(v);
            } } }),
            h("span", null, rotuloValor(v))));
        });
      };
      redesenharLista();

      const aplicar = () => {
        if (excluidos.size) st.filtros[c.id] = excluidos; else delete st.filtros[c.id];
        st.pagina = 0; fecharMenus(); desenhar();
      };

      const menu = h("div", { class: "col-menu", role: "dialog", "aria-label": "Opções da coluna " + c.rotulo },
        c.ordenavel === false ? null : h("div", { class: "col-menu-ord" },
          h("button", { type: "button", class: "col-menu-acao", on: { click: () => { st.col = c.id; st.dir = 1; fecharMenus(); desenhar(); } } }, "↑ Ordem crescente"),
          h("button", { type: "button", class: "col-menu-acao", on: { click: () => { st.col = c.id; st.dir = -1; fecharMenus(); desenhar(); } } }, "↓ Ordem decrescente")),
        h("div", { class: "col-menu-sel" },
          h("button", { type: "button", class: "link", on: { click: () => { excluidos.clear(); redesenharLista(); } } }, "Marcar todos"),
          h("button", { type: "button", class: "link", on: { click: () => { distintos.forEach((v) => excluidos.add(v)); redesenharLista(); } } }, "Limpar todos")),
        distintos.length > 10 ? h("input", { type: "search", class: "col-menu-busca", placeholder: "Filtrar valores", "aria-label": "Filtrar valores da lista",
          on: { input: (e: Event) => {
            const t = normalizarBusca((e.target as HTMLInputElement).value);
            lista.querySelectorAll(".col-menu-item").forEach((el) => {
              (el as HTMLElement).style.display = normalizarBusca(el.textContent || "").includes(t) ? "" : "none";
            });
          } } }) : null,
        lista,
        h("div", { class: "col-menu-rodape" },
          h("button", { type: "button", class: "btn btn-ghost", on: { click: fecharMenus } }, "Cancelar"),
          h("button", { type: "button", class: "btn btn-sec", on: { click: aplicar } }, "Aplicar")));

      btn.parentElement!.appendChild(menu);
      // fecha ao clicar fora
      setTimeout(() => {
        const fora = (e: MouseEvent) => { if (!menu.contains(e.target as Node) && e.target !== btn) { fecharMenus(); document.removeEventListener("mousedown", fora); } };
        document.addEventListener("mousedown", fora);
      });
      (menu.querySelector("input,button") as HTMLElement)?.focus();
    };

    return h("button", { type: "button", class: "col-funil" + (temFiltro ? " ativo" : ""),
      title: temFiltro ? "Coluna com filtro ativo — clique para ajustar" : "Filtrar e ordenar esta coluna",
      "aria-label": "Opções da coluna " + c.rotulo, on: { click: (e: Event) => { e.stopPropagation(); abrir(e.currentTarget as HTMLElement); } } },
      icone("filtro", "ic ic-xs"));
  }

  const desenhar = () => {
    const q = normalizarBusca(st.busca);
    let linhas = recortar();
    // publica o recorte atual (busca + filtros de coluna) para o export espelhar a tela.
    // Opera sobre Dados: só considera colunas cujo id é uma chave real do registro.
    const colsDados = o.colunas.filter((c) => c.id !== "awb").map((c) => ({ id: c.id, valor: (d: Dados) => (c.id in d ? d[c.id] : null) }));
    RECORTE_TABELA.set(o.id, (d: Dados) => passaRecorte(d, colsDados, st.busca, st.filtros));
    const col = o.colunas.find((c) => c.id === st.col);
    if (col) linhas.sort((a, b) => {
      const x = col.valor(a), y = col.valor(b);
      if (x === y) return 0; if (x === null || x === "") return 1; if (y === null || y === "") return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true })) * st.dir;
    });
    const paginas = Math.max(1, Math.ceil(linhas.length / porPagina));
    st.pagina = Math.min(st.pagina, paginas - 1);
    const pag = linhas.slice(st.pagina * porPagina, (st.pagina + 1) * porPagina);
    corpo.innerHTML = "";
    if (!o.linhas.length) { corpo.appendChild(o.vazio || vazio("Nenhum registro", "Não há encomendas neste recorte.")); return; }
    const sel = o.selecao;
    const tab = h("table", null,
      o.titulo ? h("caption", { class: "sr" }, o.titulo) : null,
      h("thead", null, h("tr", null,
        sel ? h("th", { class: "col-sel" }, h("input", { type: "checkbox", "aria-label": "Selecionar todos desta página", checked: pag.length > 0 && pag.every((r) => sel.marcados.has(o.chave(r))),
          on: { change: (e: Event) => { const v = (e.target as HTMLInputElement).checked; pag.forEach((r) => (v ? sel.marcados.add(o.chave(r)) : sel.marcados.delete(o.chave(r)))); sel.onMudar(); } } })) : null,
        o.colunas.map((c) => {
          const ativo = st.col === c.id;
          const temFiltro = !!(st.filtros[c.id] && st.filtros[c.id].size);
          if (c.ordenavel === false) return h("th", { class: c.classe || "", scope: "col" }, c.rotulo);
          return h("th", { class: (c.classe || "") + (temFiltro ? " col-filtrada" : ""), "aria-sort": ativo ? (st.dir === 1 ? "ascending" : "descending") : "none", scope: "col" },
            h("div", { class: "th-conteudo" },
              h("button", { type: "button", class: "ord", on: { click: () => { if (st.col === c.id) st.dir = (st.dir * -1) as 1 | -1; else { st.col = c.id; st.dir = 1; } desenhar(); } } },
                c.rotulo, h("span", { class: "ord-ic", "aria-hidden": "true" }, ativo ? (st.dir === 1 ? "▲" : "▼") : "↕")),
              botaoMenuColuna(c, temFiltro)));
        }))),
      h("tbody", null, pag.map((r) => {
        const k = o.chave(r);
        return h("tr", { class: (o.onAbrir ? "abre" : "") + (E.drawer === k ? " ativa" : ""), on: o.onAbrir ? { click: (e: Event) => { if ((e.target as HTMLElement).closest("button,input,a,label")) return; o.onAbrir!(r); } } : undefined },
          sel ? h("td", { class: "col-sel" }, h("input", { type: "checkbox", "aria-label": "Selecionar " + k, checked: sel.marcados.has(k), on: { change: (e: Event) => { (e.target as HTMLInputElement).checked ? sel.marcados.add(k) : sel.marcados.delete(k); sel.onMudar(); } } })) : null,
          o.colunas.map((c) => h("td", { class: c.classe || "" }, c.render ? c.render(r) : (c.valor(r) ?? "—"))));
      })));
    corpo.append(
      linhas.length ? h("div", { class: "tabela-rolagem", tabindex: "0", role: "region", "aria-label": o.titulo || "Tabela" }, tab) : vazio("Nenhum resultado para a busca", `Nada corresponde a “${st.busca}”. Revise o termo ou limpe a busca.`),
      h("div", { class: "paginacao" },
        h("span", null, linhas.length ? `${fmtN(st.pagina * porPagina + 1)}–${fmtN(Math.min(linhas.length, (st.pagina + 1) * porPagina))} de ${fmtN(linhas.length)}` : "0 registros",
          q ? ` (busca em ${fmtN(o.linhas.length)})` : ""),
        paginas > 1 ? h("span", { class: "pag-btns" },
          h("button", { type: "button", class: "btn btn-ghost", disabled: st.pagina === 0, on: { click: () => { st.pagina--; desenhar(); } } }, "Anterior"),
          h("span", null, `Página ${st.pagina + 1} de ${paginas}`),
          h("button", { type: "button", class: "btn btn-ghost", disabled: st.pagina >= paginas - 1, on: { click: () => { st.pagina++; desenhar(); } } }, "Próxima")) : null));
  };

  const ferramentas = h("div", { class: "tabela-ferr" },
    h("label", { class: "busca-tabela" }, icone("busca", "ic ic-sm"),
      h("input", { type: "search", id: "busca-" + o.id, placeholder: "Buscar nesta lista (AWB, cidade, entregador…)", value: st.busca, "aria-label": "Buscar nesta lista",
        on: { input: (e: Event) => { st.busca = (e.target as HTMLInputElement).value; st.pagina = 0; desenhar(); } } })),
    o.selecao && o.selecao.marcados.size ? h("div", { class: "sel-acoes" }, o.selecao.acoes(o.selecao.marcados.size)) : null,
    o.exportar || null);
  if (o.linhas.length) raiz.appendChild(ferramentas);
  raiz.appendChild(corpo);
  desenhar();
  return raiz;
}

// Copia o código da encomenda sem abrir o painel de detalhe.
async function copiarCodigo(awb: string) {
  try { await navigator.clipboard.writeText(awb); aviso(`Código ${awb} copiado.`); }
  catch { aviso("Não foi possível copiar automaticamente. Selecione o código e copie manualmente.", "info"); }
}

// Código da encomenda (abre o detalhe) com o botão de copiar ao lado.
function awbComCopia(awb: string): HTMLElement {
  return h("span", { class: "awb-copia" },
    h("button", { type: "button", class: "awb", "data-awb": awb, title: "Abrir detalhes da encomenda", on: { click: () => abrirAwb(awb) } }, awb),
    h("button", { type: "button", class: "btn-copiar", title: "Copiar código", "aria-label": `Copiar código ${awb}`, on: { click: () => copiarCodigo(awb) } }, icone("copiar", "ic ic-xs")));
}

// Colunas usuais de encomenda
function colAwb<T>(get: (r: T) => Dados): Coluna<T> {
  return { id: "awb", rotulo: "Código (AWB)", valor: (r) => awbDe(get(r)), classe: "mono", render: (r) => awbComCopia(awbDe(get(r))) };
}
function colDado<T>(col: string, get: (r: T) => Dados, rotulo?: string): Coluna<T> {
  const ehData = /Time|Date/.test(col);
  return { id: col, rotulo: rotulo || ROTULOS[col] || col, valor: (r) => { const v = get(r)[col]; return v === null || v === undefined ? null : (v as any); },
    render: (r) => { const v = get(r)[col]; return v === null || v === undefined || String(v).trim() === "" ? h("span", { class: "nulo" }, VAZIO[col] || "—") : ehData ? fmtData(v) : String(v); },
    classe: ehData ? "num" : col === "Delivery Count" ? "num" : "" };
}
