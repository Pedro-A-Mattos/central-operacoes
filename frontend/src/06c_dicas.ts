// Dicas ao passar o mouse: o mesmo texto do glossário (o "?"), em formato curto, sobre qualquer rótulo
// reconhecido (chips, legendas, abas, cabeçalhos de coluna, indicadores, filtros, etapas do funil).
// Um mecanismo só, sem mexer nos componentes: depois de cada desenho da tela, `marcarDicas` põe
// `data-explica="verbete"` nos elementos cujo texto bate com um verbete do glossário (pelo título ou por
// um apelido abaixo). O balão aparece com o mouse e com o teclado (foco); o "?" continua para a versão completa.

// Rótulos que aparecem na tela com texto diferente do título do verbete.
const APELIDOS_DICAS: Record<string, string> = {
  // situação (mapa, chips)
  "Erro de piso": "situacao_erro_piso", "Sem alerta": "situacao_sem_alerta", "Cidade ausente": "erro_cidade_ausente", "Sem coordenada": "sem_coordenada",
  "Anormal": "anormal", "Nova": "novas", "Pendentes": "pendente", "Pendências": "pendente",
  // faixas de espera e de tempo em rota
  "Sem data": "tempo_espera", "Aguardando": "tempo_espera", "Chegou": "tempo_espera",
  "Menos de 12 h": "tempo_rota", "12 a 24 h": "tempo_rota", "Mais de 24 h": "tempo_rota", "Sem saída registrada": "tempo_rota", "Em rota há": "tempo_rota",
  // abas e listas
  "Extravios": "extravio", "Avarias": "avaria", "Seguir o processo de avaria": "avaria", "Insucessos": "insucesso", "Mudanças de status": "mudou_status", "Roteiro por entregador": "roteiro",
  // ações sugeridas (Pendências de entrega)
  "Cobrar a entrega": "atrasadas", "Colocar em rota": "tent1", "Colocar em rota e ver devolução": "tent2", "Iniciar devolução": "tent3",
  "Confirmar devolução (reprogramação)": "tent3", "Investigar extravio": "extravio", "Conferir se está em rota": "ja_em_rota",
  // entregadores
  "Ocorrência já tratada (em rota de novo)": "ocorrencia_tratada", "Saiu com sinal de devolução ou ocorrência": "possivel_devolucao",
  "Saíram com sinal de devolução ou ocorrência": "possivel_devolucao", "Ocorrências vigentes": "pendente_com_ocorrencia", "Ocorr. vigente": "pendente_com_ocorrencia",
  "Ocorr. tratada": "ocorrencia_tratada", "Pend. s/ ocorr.": "pendente_sem_ocorrencia", "Entregas": "entrega_progresso", "% de entregas": "entrega_progresso",
  "Ainda na rua": "ritmo", "Abaixo do ritmo": "ritmo",
  // indicadores
  "Problemas de piso": "piso", "Tempo médio": "tempo_medio", "Já em rota após ocorrência": "ocorrencia_tratada", "Com ocorrência": "com_ocorrencia",
  // funil de totais
  "Descarregado": "descarregado", "Não recebido": "nao_recebido", "Força maior": "forca_maior", "Sem cidade": "fora_jurisdicao", "Retiradas pelo outro relatório": "retiradas_cruzadas",
  // filtros
  "Ignorar encomendas com status “descarregado”": "descarregado", "Ignorar encomendas “não recebido”": "nao_recebido", "Ignorar não recebido": "nao_recebido",
  // tela "Não recebido, mas entregue"
  "Com indício de entrega": "nao_recebido_entregue", "Com Delivery Time": "nao_recebido_entregue", "Sem Delivery Time": "nao_recebido_entregue",
  "Com vs sem Delivery Time": "nao_recebido_entregue", "Indício": "nao_recebido_entregue", "Só tempo de entrega": "nao_recebido_entregue",
  "Tempo de entrega (Delivery Time)": "col_saiu_rota",
  // histórico, funil, mapa
  "Saíram": "hist_saiu", "Entraram": "hist_entrou", "Pend. de entrega": "excecoes", "Rota > 24 h": "tempo_rota", "Em rota há mais de 24 h": "tempo_rota",
  "Referência": "referencia", "Linhas no arquivo atualizado": "funil_inicio", "Encomendas no relatório atualizado": "pendente",
  "Pendências por localização": "mapa", "Resumo por entregador": "desempenho", "Cidades ignoradas": "cidades_ignoradas",
  "Pendências · tempo em rota": "tempo_rota", "Regra RN-003 · decisão pendente": "entregue_confirmada", "Como a conferência decide": "regra_derivada",
  // colunas gerais
  "Cidade · bairro": "col_local", "Código (AWB)": "col_awb", "Waybill No": "col_awb", "Chegada ao galpão": "col_chegada", "Chegou em": "col_chegada", "Tempo em espera": "tempo_espera", "Há quanto tempo em rota": "tempo_rota",
  "Status": "col_status", "Status atual": "col_status", "Último status na base": "col_status", "Last Scan Status": "col_status",
  "Problema": "tipos_problema", "Last Problem Type": "tipos_problema",
  // títulos de gráficos
  "Pendências por cidade": "por_cidade", "Ocorrências registradas": "tipos_problema", "Entregadores com mais pendências": "por_entregador",
  "Resumo de todos os entregadores": "desempenho", "Composição por entregador": "desempenho",
  // colunas de tabela
  "Pendente há": "col_pendente_ha", "Tentativas": "col_tentativas", "Data da ocorrência": "col_data_ocorrencia", "Saiu para rota": "col_saiu_rota",
  "Ação sugerida": "col_acao_sugerida", "Situação": "col_situacao", "Piso": "col_piso", "Deveria estar com": "col_deveria", "Está com": "col_esta_com", "Ocorrência": "col_ocorrencia",
};

const _chaveDica = (s: string) => normalizarBusca(s).replace(/\s+/g, " ");
// O mesmo texto significa coisas diferentes conforme o lugar: nos chips "Entregue" e "Não entregue" são a classe
// operacional; nos gráficos, "Não entregue" é um tipo de problema registrado.
const APELIDOS_POR_CONTEXTO: { seletor: string; mapa: Record<string, string> }[] = [
  // Conferência de piso: "Problema" é o tipo de erro de piso (nas outras telas é a ocorrência registrada pela transportadora)
  { seletor: "#ms-pi-tipo .ms-rot, .piso-layout th", mapa: { "Problema": "piso_problema" } },
  // A aba "Pendentes" de Pendências de entrega é a regra de prazo; "Pendentes" nos indicadores é o conceito geral
  { seletor: ".aba", mapa: { "Pendentes": "atrasadas" } },
  { seletor: ".chip", mapa: { "Entregue": "classe_operacional", "Não entregue": "classe_operacional" } },
  { seletor: ".barra-rotulo", mapa: { "Reprogramação": "tipo_reprogramacao", "Não entregue": "tipo_nao_entregue", "Lost package": "tipo_lost", "Avaria": "tipo_avaria" } },
];
// título do verbete e apelidos → verbete (o primeiro verbete com o mesmo título vale)
const INDICE_DICAS: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [k, e] of Object.entries(GLOSSARIO)) if (!m.has(_chaveDica(e.titulo))) m.set(_chaveDica(e.titulo), k);
  for (const [rot, k] of Object.entries(APELIDOS_DICAS)) m.set(_chaveDica(rot), k);
  return m;
})();

const SELETOR_DICAS = ".chip, .aba, .mapa-leg li, .legenda > span, .rl, .kpi-rotulo, th, .barra-rotulo, .ms-rot, .alternar, .fig-tit > strong, h2.fig-tit, .alerta-origem, .funil-rot, .alerta-txt > strong";

// Texto do rótulo, sem contagens, setas de ordenação nem botões "?" que moram dentro do mesmo elemento.
function rotuloDoElemento(el: Element): string {
  let alvo: Element = el;
  if (el.matches(".rl")) alvo = el.querySelector(".rl-rot") || el;
  else if (el.matches("th")) alvo = el.querySelector(".ord") || el;
  else if (el.matches(".alternar")) alvo = el.querySelector("span:not(.alternar-trilho):not(.ajuda):not(.dica)") || el;
  else if (el.matches(".funil-rot") && el.firstElementChild && el.firstElementChild.matches("button")) alvo = el.firstElementChild;
  let t = "";
  alvo.childNodes.forEach((n) => { if (n.nodeType === 3) t += n.textContent; });
  return t.replace(/[▲▼↕↑↓]/g, "").replace(/\s+/g, " ").trim();
}

function chaveDoRotulo(texto: string, el?: Element): string | null {
  if (!texto) return null;
  const candidatos = [texto, texto.split(":")[0], texto.replace(/[\d.,%+\s]+$/, "")];
  if (candidatos.some((c) => /^\d{2}\/\d{2} · (no dia|há \d+ dias?|após a referência)$/.test(c))) return "tempo_espera"; // legenda do Mapa por data de chegada
  if (el) for (const ctx of APELIDOS_POR_CONTEXTO) if (el.matches(ctx.seletor)) {
    for (const c of candidatos) { const k = Object.entries(ctx.mapa).find(([rot]) => _chaveDica(rot) === _chaveDica(c)); if (k) return k[1]; }
  }
  for (const c of candidatos) {
    const k = INDICE_DICAS.get(_chaveDica(c));
    if (k) return k;
  }
  return null;
}

// Marca, na árvore recém-desenhada, os elementos que têm explicação no glossário.
function marcarDicas(raiz: ParentNode) {
  raiz.querySelectorAll(SELETOR_DICAS).forEach((el) => {
    if (el.hasAttribute("data-explica")) return;
    const k = chaveDoRotulo(rotuloDoElemento(el), el);
    if (!k || !GLOSSARIO[k]) return;
    el.setAttribute("data-explica", k);
    if (el.hasAttribute("title")) el.removeAttribute("title"); // não duplica o balão nativo
  });
}

// ---------- balão ----------
const DICA = { el: null as HTMLElement | null, alvo: null as Element | null, timer: 0, clique: null as { x: number; y: number } | null };

function conteudoDaDica(chave: string): HTMLElement[] {
  const e = GLOSSARIO[chave];
  const sec = (rot: string, txt?: string) => (txt ? h("p", { class: "dica-sec" }, h("b", null, rot + ": "), txt) : null);
  return [h("strong", null, e.titulo), h("p", null, e.oQue), sec("Como é calculado", e.calculo), sec("Atenção", e.aviso), sec("O que fazer", e.acao)].filter((x): x is HTMLElement => !!x);
}

function ocultarDica() {
  clearTimeout(DICA.timer);
  DICA.alvo = null;
  if (DICA.el) DICA.el.hidden = true;
}

function mostrarDica(alvo: Element) {
  const k = alvo.getAttribute("data-explica");
  if (!k || !GLOSSARIO[k] || !document.body.contains(alvo)) return;
  if (!DICA.el) { DICA.el = h("div", { id: "dica-flutuante", class: "dica-flutuante", role: "tooltip" }); document.body.appendChild(DICA.el); }
  const d = DICA.el;
  d.replaceChildren(...conteudoDaDica(k));
  d.hidden = false; d.style.visibility = "hidden";
  const r = alvo.getBoundingClientRect(), p = d.getBoundingClientRect();
  const esquerda = Math.min(Math.max(12, r.left), window.innerWidth - p.width - 12);
  let topo = r.bottom + 8;
  if (topo + p.height > window.innerHeight - 12 && r.top - p.height - 8 > 12) topo = r.top - p.height - 8;
  d.style.left = esquerda + "px"; d.style.top = Math.max(12, topo) + "px"; d.style.visibility = "visible";
  DICA.alvo = alvo;
}

function instalarDicas() {
  if (typeof document.addEventListener !== "function") return;
  const alvoDe = (t: EventTarget | null) => (t instanceof Element ? t.closest("[data-explica]") : null);
  // Depois de um clique a tela é redesenhada e o mouse continua parado sobre o rótulo novo: o navegador
  // dispara "mouseover" sozinho. Só volta a mostrar a dica quando o mouse realmente se mexer.
  document.addEventListener("mouseover", (ev) => {
    const a = alvoDe(ev.target);
    if (!a || a === DICA.alvo) return;
    const m = ev as MouseEvent;
    if (DICA.clique && Math.abs(m.clientX - DICA.clique.x) < 4 && Math.abs(m.clientY - DICA.clique.y) < 4) return;
    clearTimeout(DICA.timer);
    DICA.timer = window.setTimeout(() => mostrarDica(a), 250);
  });
  document.addEventListener("mousemove", (ev) => {
    if (DICA.clique && (Math.abs(ev.clientX - DICA.clique.x) >= 4 || Math.abs(ev.clientY - DICA.clique.y) >= 4)) DICA.clique = null;
  });
  document.addEventListener("mouseout", (ev) => {
    const a = alvoDe(ev.target);
    if (!a || alvoDe((ev as MouseEvent).relatedTarget) === a) return; // ainda dentro do mesmo rótulo
    ocultarDica();
  });
  document.addEventListener("focusin", (ev) => { const a = alvoDe(ev.target); if (a && !DICA.clique) mostrarDica(a); }); // foco vindo do clique não abre o balão
  document.addEventListener("focusout", () => ocultarDica());
  document.addEventListener("keydown", (ev) => { DICA.clique = null; if (ev.key === "Escape") ocultarDica(); });
  document.addEventListener("mousedown", (ev) => { DICA.clique = { x: ev.clientX, y: ev.clientY }; ocultarDica(); });
  document.addEventListener("scroll", () => ocultarDica(), true);
  window.addEventListener("resize", () => ocultarDica());
}
