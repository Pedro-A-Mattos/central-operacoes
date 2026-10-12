// Estrutura da aplicação: navegação lateral, barra superior com busca, tela e painel de detalhes.

const NAV: { grupo: string; itens: { tela: Tela; rotulo: string; icone: string; badge?: () => { n: number; tom: Tom } | null }[] }[] = [
  { grupo: "", itens: [{ tela: "torre", rotulo: "Torre de controle", icone: "torre" }] },
  { grupo: "Agir agora", itens: [
    { tela: "piso", rotulo: "Conferência de piso", icone: "piso", badge: () => ({ n: errosPiso().length, tom: "critico" }) },
    { tela: "excecoes", rotulo: "Exceções", icone: "alerta", badge: () => ({ n: excAtivas("devolucao").length + excAtivas("extravio").length + excAtivas("insucesso").length + excAtivas("revisar_tentativas").length, tom: "atencao" }) },
  ] },
  { grupo: "Monitorar", itens: [
    { tela: "pendencias", rotulo: "Pendências", icone: "pendencias" },
    { tela: "entregadores", rotulo: "Entregadores", icone: "entregador" },
    { tela: "historico", rotulo: "Histórico", icone: "relogio" },
    { tela: "mapa", rotulo: "Mapa", icone: "mapa" },
  ] },
  { grupo: "Consultar", itens: [
    { tela: "a-entregar", rotulo: "Encomendas a entregar", icone: "lista" },
    { tela: "mudancas", rotulo: "O que mudou", icone: "mudou" },
    { tela: "fora", rotulo: "Fora da jurisdição", icone: "fora" },
    { tela: "regras", rotulo: "Regras de abrangência", icone: "regras" },
    { tela: "criterios", rotulo: "Importação e critérios", icone: "config" },
  ] },
];

const BUSCA = { q: "", aberta: false, msg: "" };

function buscarAwb(bruto: string) {
  const q = bruto.trim().replace(/\.0$/, "");
  if (!q) return;
  if (E.idx.has(q)) { BUSCA.q = ""; BUSCA.aberta = false; BUSCA.msg = ""; abrirAwb(q); return; }
  const a = E.analise!;
  BUSCA.msg = a.removidas.fm.includes(q) || a.removidas.descarregado.includes(q) || a.removidas.nao_recebido.includes(q) ? "" : `Nenhuma encomenda com o código ${q} nos dois relatórios.`;
  if (!BUSCA.msg) { abrirAwb(q); return; }
  BUSCA.aberta = true; renderizar();
  setTimeout(() => document.getElementById("busca-awb")?.focus());
}

function barraBusca(): HTMLElement {
  const q = BUSCA.q.trim();
  const sugestoes = q.length >= 3 ? [...E.idx.keys()].filter((k) => k.includes(q)).slice(0, 6) : [];
  const form = h("form", { class: "busca-global", role: "search", on: { submit: (e: Event) => { e.preventDefault(); buscarAwb(BUSCA.q); } } },
    h("label", { for: "busca-awb", class: "sr" }, "Buscar código da encomenda (AWB)"),
    icone("busca", "ic ic-sm"),
    h("input", { id: "busca-awb", type: "search", inputmode: "numeric", autocomplete: "off", placeholder: "Buscar código da encomenda (AWB)", value: BUSCA.q,
      "aria-expanded": BUSCA.aberta && (sugestoes.length || BUSCA.msg) ? "true" : "false", "aria-controls": "busca-sug",
      on: { input: (e: Event) => { BUSCA.q = (e.target as HTMLInputElement).value; BUSCA.msg = ""; BUSCA.aberta = true; renderizar(); },
        keydown: (e: KeyboardEvent) => { if (e.key === "Escape") { BUSCA.aberta = false; renderizar(); } if (e.key === "ArrowDown") { e.preventDefault(); (document.querySelector("#busca-sug button") as HTMLElement)?.focus(); } } } }),
    BUSCA.aberta && (sugestoes.length || BUSCA.msg) ? h("div", { class: "busca-sug", id: "busca-sug" },
      BUSCA.msg ? h("p", null, BUSCA.msg, " Confira os dígitos ou o relatório de origem.") : null,
      sugestoes.map((s) => { const r = E.idx.get(s)!; const cid = r.fonte === "atual" || r.fonte === "saiu" ? r.reg.dados["Consignee City"] : null;
        const tipo = r.fonte === "atual" ? "Pendente" : r.fonte === "saiu" ? (r.reg.categoria === "provavel_entrega" ? "Provável entrega" : "Possível devolução") : "Fora da jurisdição";
        return h("button", { type: "button", on: { click: () => { BUSCA.q = ""; BUSCA.aberta = false; abrirAwb(s); },
          keydown: (e: KeyboardEvent) => { const el = e.currentTarget as HTMLElement; if (e.key === "ArrowDown") { e.preventDefault(); (el.nextElementSibling as HTMLElement)?.focus(); } if (e.key === "ArrowUp") { e.preventDefault(); ((el.previousElementSibling as HTMLElement) || document.getElementById("busca-awb"))?.focus(); } } } },
          h("span", { class: "mono" }, s), h("small", null, tipo, cid ? " · " + cid : "")); })) : null);
  return form;
}

function lateral(): HTMLElement {
  const a = E.analise;
  return h("nav", { class: "lateral" + (E.menuAberto ? " aberta" : ""), "aria-label": "Navegação principal" },
    h("div", { class: "marca" }, h("span", { class: "marca-sinal", "aria-hidden": "true" }), h("span", null, h("strong", null, "Central de Operações"), h("small", null, "Distribuição de encomendas"))),
    a ? NAV.map((g) => h("div", { class: "nav-grupo" },
      g.grupo ? h("p", { class: "nav-rot" }, g.grupo) : null,
      h("ul", null, g.itens.map((it) => {
        const b = it.badge ? it.badge() : null;
        return h("li", null, h("a", { href: "#" + it.tela, class: "nav-item" + (E.tela === it.tela ? " ativo" : ""), "aria-current": E.tela === it.tela ? "page" : null,
          on: { click: (e: Event) => { e.preventDefault(); navegar(it.tela); } } },
          icone(it.icone), h("span", null, it.rotulo), b && b.n ? h("span", { class: "nav-badge tom-" + b.tom, "aria-label": `${b.n} pendentes de ação` }, fmtN(b.n)) : null));
      })))) : h("p", { class: "nav-vazio" }, "Importe os relatórios para liberar as análises."),
    h("div", { class: "nav-rodape" },
      h("button", { type: "button", class: "btn btn-sec largo", on: { click: () => navegar("importar") } }, icone("importar", "ic ic-sm"), "Nova importação"),
      E.servico ? h("p", { class: "modo" }, h("span", { class: "ponto ponto-" + E.servico.modo }), E.servico.modo === "python" ? "Motor Python conectado" : "Processamento neste navegador") : null));
}

function topo(): HTMLElement {
  const a = E.analise;
  return h("header", { class: "topo" },
    h("button", { type: "button", class: "btn-icone menu-btn", "aria-label": "Abrir menu", "aria-expanded": E.menuAberto ? "true" : "false", on: { click: () => atualizar(() => { E.menuAberto = !E.menuAberto; }) } }, icone("menu")),
    a ? h("div", { class: "contexto" },
      h("span", { class: "ctx-arq", title: `Base: ${a.arquivos.base} → Atualizado: ${a.arquivos.atual}` }, icone("arquivo", "ic ic-xs"), h("span", null, a.arquivos.base), icone("seta", "ic ic-xs"), h("span", null, a.arquivos.atual)),
      h("span", { class: "ctx-ref", title: "Origem: " + ORIGEM_REF[a.referencia_origem] }, icone("relogio", "ic ic-xs"), "Referência ", fmtData(a.referencia_backlog), explica("referencia", "topo")),
      E.exemplo ? chip("Relatórios de exemplo", "info") : null) : h("div", { class: "contexto" }),
    a ? barraBusca() : null);
}

function telaAtual(): HTMLElement {
  if (!E.analise && E.tela !== "importar") E.tela = "importar";
  switch (E.tela) {
    case "importar": return telaImportar();
    case "torre": return telaTorre();
    case "piso": return telaPiso();
    case "excecoes": return telaExcecoes();
    case "pendencias": return telaPendencias();
    case "entregadores": return telaEntregadores();
    case "historico": return telaHistorico();
    case "mapa": return telaMapa();
    case "a-entregar": return telaAEntregar();
    case "mudancas": return telaMudancas();
    case "fora": return telaFora();
    case "regras": return telaRegras();
    case "criterios": return telaCriterios();
  }
}

function render() {
  const raiz = document.getElementById("app")!;
  const ativo = document.activeElement as HTMLElement | null;
  const idFoco = ativo && ativo.id ? ativo.id : null;
  const sel = ativo && (ativo as HTMLInputElement).selectionStart !== undefined ? [(ativo as HTMLInputElement).selectionStart, (ativo as HTMLInputElement).selectionEnd] : null;
  const yAntes = window.scrollY;
  let conteudo: HTMLElement;
  if (E.iniciando) conteudo = h("div", { class: "tela iniciando" }, h("span", { class: "giro" }), h("p", null, "Preparando a central…"));
  else {
    try { conteudo = telaAtual(); }
    catch (e) { console.error(e); conteudo = h("div", { class: "tela" }, caixaProblema(problemaDe(e))); }
  }
  const g = gaveta();
  raiz.replaceChildren(...[
    h("a", { href: "#conteudo", class: "pular", on: { click: (e: Event) => { e.preventDefault(); document.getElementById("titulo-tela")?.focus(); } } }, "Pular para o conteúdo"),
    lateral(),
    E.menuAberto ? h("div", { class: "veu", on: { click: () => atualizar(() => { E.menuAberto = false; }) } }) : null,
    h("div", { class: "principal" + (g ? " com-gaveta" : "") }, topo(), h("main", { id: "conteudo" }, conteudo)),
    g].filter((x): x is HTMLElement => !!x));
  if (idFoco) {
    const el = document.getElementById(idFoco) as HTMLInputElement | null;
    if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange && sel[0] !== null) try { el.setSelectionRange(sel[0]!, sel[1]!); } catch { /* tipo sem seleção */ } }
  }
  if (Math.abs(window.scrollY - yAntes) > 2) window.scrollTo(0, yAntes);
  posicionarAjuda();
}

// O balão da ajuda é fixo na tela, ancorado ao botão "?" (não é cortado por tabelas com rolagem).
function posicionarAjuda() {
  const pop = document.querySelector<HTMLElement>(".ajuda-pop");
  if (!pop || window.innerWidth <= 560) return;
  const btn = pop.parentElement!.querySelector<HTMLElement>(".ajuda-btn")!;
  const r = btn.getBoundingClientRect(), p = pop.getBoundingClientRect();
  let left = Math.min(Math.max(16, r.left - 12), window.innerWidth - p.width - 16);
  let top = r.bottom + 8;
  if (top + p.height > window.innerHeight - 12 && r.top - p.height - 8 > 12) top = r.top - p.height - 8;
  pop.style.left = left + "px"; pop.style.top = Math.max(12, top) + "px";
}

async function iniciar() {
  renderizar = render;
  document.documentElement.lang = "pt-BR";
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !(e.target as HTMLElement).closest("input,textarea,select")) { const b = document.getElementById("busca-awb"); if (b) { e.preventDefault(); b.focus(); } }
    if (e.key === "Escape" && AJUDA.aberta) { fecharAjuda(); return; }
    if (e.key === "Escape" && E.drawer && !(e.target as HTMLElement).closest(".gaveta")) fecharAwb();
  });
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (AJUDA.aberta && !t.closest(".ajuda")) { AJUDA.aberta = ""; renderizar(); }
    if (BUSCA.aberta && !t.closest(".busca-global")) { BUSCA.aberta = false; renderizar(); }
    if (MS_ABERTO.id && !t.closest(".ms")) { const d = document.getElementById("ms-" + MS_ABERTO.id) as HTMLDetailsElement | null; MS_ABERTO.id = ""; if (d) d.open = false; }
  });
  window.addEventListener("scroll", posicionarAjuda, { passive: true });
  window.addEventListener("resize", posicionarAjuda);
  render();
  E.servico = await criarServico();
  E.iniciando = false;
  E.servico.listarImportacoes().then((h) => atualizar(() => { E.historico = h; })).catch(() => {});
  const hash = location.hash.replace("#", "") as Tela;
  if (E.servico.modo === "local" && EXEMPLO_EMBUTIDO) {
    E.exemplo = true;
    render();
    await usarExemplos(true);
    if (hash && hash in TITULOS && hash !== "importar" && E.analise) navegar(hash);
  } else render();
}

iniciar();
