// Monitorar: Histórico de importações e Mapa das pendências.

// ---------- mini gráfico de linha (um indicador por gráfico: um eixo só) ----------
function linhaMini(o: { titulo: string; serie: { x: string; y: number }[]; tom: string; unidade: [string, string]; ajuda?: string }): HTMLElement {
  const W = 320, H = 120, ML = 8, MR = 44, MT = 12, MB = 22;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("class", "linha-svg"); svg.setAttribute("role", "img");
  const ys = o.serie.map((p) => p.y);
  const max = Math.max(1, ...ys), min = Math.min(0, ...ys);
  const x = (i: number) => ML + (o.serie.length === 1 ? (W - ML - MR) / 2 : (i * (W - ML - MR)) / (o.serie.length - 1));
  const y = (v: number) => MT + (1 - (v - min) / (max - min || 1)) * (H - MT - MB);
  const el = (tag: string, at: Record<string, string>) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); svg.appendChild(e); return e; };
  el("line", { x1: String(ML), x2: String(W - MR), y1: String(y(min)), y2: String(y(min)), class: "linha-base" });
  el("line", { x1: String(ML), x2: String(W - MR), y1: String(y(max)), y2: String(y(max)), class: "linha-grade" });
  const tMax = el("text", { x: String(W - MR + 6), y: String(y(max) + 4), class: "linha-eixo" }); tMax.textContent = fmtN(max);
  const tMin = el("text", { x: String(W - MR + 6), y: String(y(min) + 4), class: "linha-eixo" }); tMin.textContent = fmtN(min);
  if (o.serie.length > 1) el("polyline", { points: o.serie.map((p, i) => `${x(i)},${y(p.y)}`).join(" "), class: "linha-traco tom-" + o.tom });
  o.serie.forEach((p, i) => {
    const c = el("circle", { cx: String(x(i)), cy: String(y(p.y)), r: i === o.serie.length - 1 ? "5" : "4", class: "linha-ponto tom-" + o.tom });
    const t = document.createElementNS(ns, "title"); t.textContent = `${fmtData(p.x)}: ${plural(p.y, o.unidade[0], o.unidade[1])}`; c.appendChild(t);
  });
  if (o.serie.length) {
    const ult = o.serie[o.serie.length - 1];
    const t = el("text", { x: String(x(o.serie.length - 1)), y: String(H - 6), class: "linha-eixo", "text-anchor": "end" }); t.textContent = fmtData(ult.x);
    const t0 = el("text", { x: String(x(0)), y: String(H - 6), class: "linha-eixo", "text-anchor": "start" }); if (o.serie.length > 1) t0.textContent = fmtData(o.serie[0].x);
  }
  svg.setAttribute("aria-label", `${o.titulo}: ${o.serie.map((p) => `${fmtData(p.x)} ${p.y}`).join("; ")}`);
  const ultimo = o.serie.length ? o.serie[o.serie.length - 1].y : 0;
  const ant = o.serie.length > 1 ? o.serie[o.serie.length - 2].y : null;
  return h("figure", { class: "grafico linha-mini" },
    h("figcaption", null, h("span", { class: "fig-tit" }, h("strong", null, o.titulo), o.ajuda ? explica(o.ajuda, "h-" + o.titulo) : null),
      h("span", null, h("b", { class: "linha-valor" }, fmtN(ultimo)), ant === null ? " na última importação" : ` · ${ultimo - ant >= 0 ? "+" : "−"}${fmtN(Math.abs(ultimo - ant))} desde a anterior`)),
    svg);
}

function telaHistorico(): HTMLElement {
  const hist = E.historico;
  const a = E.analise!;
  const estaNoHist = hist.some((r) => r.chave === a.referencia_backlog + "|" + a.arquivos.atual);
  const linhas = hist.map((r, i) => {
    const ant = i > 0 ? hist[i - 1] : null;
    const atual = new Set(r.pendentes), anterior = ant ? new Set(ant.pendentes) : null;
    return {
      r, saiu: anterior ? [...anterior].filter((x) => !atual.has(x)).length : null,
      entrou: anterior ? r.pendentes.filter((x) => !anterior.has(x)).length : null,
    };
  }).reverse();
  return h("div", { class: "tela" },
    cabecalho({ area: "Monitorar", titulo: "Histórico", ajuda: "historico", pergunta: "As pendências estão caindo? O que mudou de uma importação para outra?",
      resposta: hist.length
        ? h("p", null, h("strong", null, plural(hist.length, "importação guardada", "importações guardadas")), ` · ${E.servico?.persistencia === "servidor" ? "no servidor" : E.servico?.persistencia === "compartilhada" ? "no banco deste aplicativo" : "neste navegador"}.`,
            !estaNoHist ? " A análise aberta agora não está no histórico (relatórios de exemplo não são guardados)." : "")
        : undefined }),
    hist.length === 0
      ? vazio("Nenhuma importação guardada ainda", "Cada análise que você processar com seus próprios relatórios é guardada aqui. Os relatórios de exemplo não entram no histórico. Para testar, importe tabela_base × ultima_tabela e depois ultima_tabela × o relatório de 11/10.",
          h("button", { type: "button", class: "btn btn-sec", on: { click: () => navegar("importar") } }, icone("importar", "ic ic-sm"), "Nova importação"))
      : [
        h("div", { class: "graficos g3" },
          linhaMini({ titulo: "Pendentes", serie: hist.map((r) => ({ x: r.referencia, y: r.resumo.pendentes })), tom: "acento", unidade: ["pendente", "pendentes"], ajuda: "pendente" }),
          linhaMini({ titulo: "Problemas de piso", serie: hist.map((r) => ({ x: r.referencia, y: r.piso })), tom: "critico", unidade: ["problema", "problemas"], ajuda: "piso" }),
          linhaMini({ titulo: "Em rota há mais de 24 h", serie: hist.map((r) => ({ x: r.referencia, y: r.em_rota_24h })), tom: "atencao", unidade: ["encomenda", "encomendas"], ajuda: "tempo_rota" })),
        h("section", { class: "bloco" },
          h("div", { class: "bloco-cab" }, h("h2", null, "Importações"), h("span", { class: "nota" }, "Mais recente primeiro. “Saíram” e “Entraram” comparam as pendentes com a importação anterior.")),
          tabela({ id: "hist", titulo: "Importações guardadas", linhas, chave: (l) => l.r.chave, porPagina: 20,
            colunas: [
              { id: "ref", rotulo: "Referência", valor: (l) => l.r.referencia, render: (l) => h("span", { class: "duas" }, fmtData(l.r.referencia), h("small", null, ORIGEM_REF[l.r.referencia_origem] || "")) },
              { id: "arq", rotulo: "Relatório atualizado", valor: (l) => l.r.arquivos.atual, classe: "mono" },
              { id: "pend", rotulo: "Pendentes", valor: (l) => l.r.resumo.pendentes, classe: "num" },
              { id: "saiu", rotulo: "Saíram", valor: (l) => l.saiu, classe: "num", render: (l) => (l.saiu === null ? h("span", { class: "nulo" }, "—") : fmtN(l.saiu)) },
              { id: "entrou", rotulo: "Entraram", valor: (l) => l.entrou, classe: "num", render: (l) => (l.entrou === null ? h("span", { class: "nulo" }, "—") : fmtN(l.entrou)) },
              { id: "piso", rotulo: "Piso", valor: (l) => l.r.piso, classe: "num" },
              { id: "exc", rotulo: "Exceções", valor: (l) => l.r.excecoes, classe: "num" },
              { id: "rota", rotulo: "Rota > 24 h", valor: (l) => l.r.em_rota_24h, classe: "num" },
            ],
            exportar: botaoExportar("historico_importacoes.xlsx", () => ({ linhas: linhas.map((l) => ({ referencia: l.r.referencia, origem_referencia: l.r.referencia_origem, arquivo_base: l.r.arquivos.base, arquivo_atualizado: l.r.arquivos.atual,
              pendentes: l.r.resumo.pendentes, sairam: l.saiu, entraram: l.entrou, provaveis_entregas: l.r.resumo.saiu_entregue, possiveis_devolucoes: l.r.resumo.saiu_devolucao, novas: l.r.resumo.novas, piso: l.r.piso, excecoes: l.r.excecoes, em_rota_24h: l.r.em_rota_24h })),
              colunas: ["referencia", "origem_referencia", "arquivo_base", "arquivo_atualizado", "pendentes", "sairam", "entraram", "provaveis_entregas", "possiveis_devolucoes", "novas", "piso", "excecoes", "em_rota_24h"] })) })),
      ]);
}

// Quantas importações do histórico já tinham esta AWB como pendente (para o painel da encomenda).
function vistaNoHistorico(awb: string): { primeira: string; vezes: number } | null {
  const regs = E.historico.filter((r) => r.pendentes.includes(awb));
  return regs.length ? { primeira: regs[0].referencia, vezes: regs.length } : null;
}

// ---------- mapa esquemático (sem mapa de fundo) ----------
function situacaoMapa(r: RegAtual): { chave: string; tom: string } {
  if (r.erro_piso) return { chave: "Erro de piso", tom: "critico" };
  if (r.excecoes.some((x) => !justificada(awbDe(r.dados)) && x)) return { chave: "Exceção ativa", tom: "atencao" };
  return { chave: "Sem alerta", tom: "acento" };
}
const coordenada = (v: Valor) => (typeof v === "number" ? v : v === null ? NaN : Number(String(v).replace(",", ".")));

type PontoMapa = { r: RegAtual; lat: number; lon: number };

// Cor concreta (hex) a partir do tom, lida das variáveis CSS para respeitar o tema.
function corDoTom(tom: string): string {
  const map: Record<string, string> = { critico: "--critico", atencao: "--atencao-barra", acento: "--acento", ok: "--ok-barra", neutro: "--linha-forte" };
  const varName = map[tom] || "--linha-forte";
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || "#7b8f98";
}

// ---------- Web Mercator (padrão dos "slippy maps" OSM/Google) ----------
const TAM_TILE = 256;
function lonParaX(lon: number, z: number): number { return ((lon + 180) / 360) * Math.pow(2, z) * TAM_TILE; }
function latParaY(lat: number, z: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Math.pow(2, z) * TAM_TILE;
}

// Guarda o zoom/centro entre renders enquanto o usuário navega no mapa.
const vistaMapa: { z: number; lat: number; lon: number; chave: string } = { z: 0, lat: 0, lon: 0, chave: "" };

function mapaCanvas(pts: PontoMapa[], corDe: (r: RegAtual) => { chave: string; tom: string }, aoSair: () => void): HTMLElement {
  const moldura = document.createElement("div");
  moldura.className = "mapa-moldura mapa-interativo";
  const W = 800, H = 520;
  const canvas = document.createElement("canvas");
  canvas.className = "mapa-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `Mapa com ${pts.length} encomendas pendentes. Use a lista em Pendências para navegar pelo teclado.`);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // enquadra os pontos: acha zoom/centro que cabem todos, salvo se já há uma vista salva do mesmo recorte
  const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon);
  const latMin = Math.min(...lats), latMax = Math.max(...lats), lonMin = Math.min(...lons), lonMax = Math.max(...lons);
  const chave = `${latMin.toFixed(3)},${latMax.toFixed(3)},${lonMin.toFixed(3)},${lonMax.toFixed(3)}`;
  let z: number;
  if (vistaMapa.chave === chave) { z = vistaMapa.z; }
  else {
    z = 12;
    for (let tz = 16; tz >= 2; tz--) {
      const larg = lonParaX(lonMax, tz) - lonParaX(lonMin, tz);
      const alt = latParaY(latMin, tz) - latParaY(latMax, tz);
      if (larg <= W - 40 && alt <= H - 40) { z = tz; break; }
    }
    vistaMapa.chave = chave; vistaMapa.z = z;
    vistaMapa.lat = (latMin + latMax) / 2; vistaMapa.lon = (lonMin + lonMax) / 2;
  }

  const tiles = new Map<string, HTMLImageElement>();
  let caiuParaEsquema = false;
  const atrib = h("div", { class: "mapa-atrib" }, "© ", h("a", { href: "https://www.openstreetmap.org/copyright", target: "_blank", rel: "noopener" }, "OpenStreetMap"), " contributors");
  const dica = document.createElement("div");
  dica.className = "mapa-dica";
  dica.hidden = true;

  function desenhar() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--sup-2").trim() || "#eef2f4";
    ctx.fillRect(0, 0, W, H);
    const cx = lonParaX(vistaMapa.lon, z), cy = latParaY(vistaMapa.lat, z);
    const esq = cx - W / 2, topo = cy - H / 2;
    const n = Math.pow(2, z);
    const tx0 = Math.floor(esq / TAM_TILE), ty0 = Math.floor(topo / TAM_TILE);
    const tx1 = Math.floor((esq + W) / TAM_TILE), ty1 = Math.floor((topo + H) / TAM_TILE);
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
      const txx = ((tx % n) + n) % n;
      if (ty < 0 || ty >= n) continue;
      const chaveT = `${z}/${txx}/${ty}`;
      const px = Math.round(tx * TAM_TILE - esq), py = Math.round(ty * TAM_TILE - topo);
      const img = tiles.get(chaveT);
      if (img && img.complete && img.naturalWidth) { ctx.drawImage(img, px, py, TAM_TILE, TAM_TILE); continue; }
      if (!tiles.has(chaveT)) {
        const sub = ["a", "b", "c"][(txx + ty) % 3];
        const im = new Image();
        im.crossOrigin = "anonymous";
        im.src = `https://${sub}.tile.openstreetmap.org/${z}/${txx}/${ty}.png`;
        im.onload = () => { if (!caiuParaEsquema) desenhar(); };
        im.onerror = () => { if (!caiuParaEsquema) { caiuParaEsquema = true; aoSair(); } };
        tiles.set(chaveT, im);
      }
    }
    // pontos por cima
    const sel = E.drawer;
    for (const p of pts) {
      const x = lonParaX(p.lon, z) - esq, y = latParaY(p.lat, z) - topo;
      if (x < -8 || y < -8 || x > W + 8 || y > H + 8) continue;
      const cor = corDe(p.r);
      ctx.beginPath();
      ctx.arc(x, y, awbDe(p.r.dados) === sel ? 7 : 5, 0, 2 * Math.PI);
      ctx.fillStyle = corDoTom(cor.tom);
      ctx.fill();
      ctx.lineWidth = awbDe(p.r.dados) === sel ? 3 : 1.5;
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--sup").trim() || "#fff";
      ctx.stroke();
    }
  }

  const pontoNoEvento = (ev: MouseEvent): PontoMapa | null => {
    const rect = canvas.getBoundingClientRect();
    const mx = ((ev.clientX - rect.left) / rect.width) * W, my = ((ev.clientY - rect.top) / rect.height) * H;
    const cx = lonParaX(vistaMapa.lon, z) - W / 2, cy = latParaY(vistaMapa.lat, z) - H / 2;
    let achado: PontoMapa | null = null, melhor = 10;
    for (const p of pts) {
      const x = lonParaX(p.lon, z) - cx, y = latParaY(p.lat, z) - cy;
      const d = Math.hypot(x - mx, y - my);
      if (d < melhor) { melhor = d; achado = p; }
    }
    return achado;
  };

  // arraste (pan)
  let arrastando = false, moveu = false, px = 0, py = 0;
  canvas.addEventListener("mousedown", (ev) => { arrastando = true; moveu = false; px = ev.clientX; py = ev.clientY; });
  window.addEventListener("mouseup", () => { arrastando = false; });
  canvas.addEventListener("mousemove", (ev) => {
    if (arrastando) {
      const dx = ev.clientX - px, dy = ev.clientY - py; px = ev.clientX; py = ev.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moveu = true;
      const cx = lonParaX(vistaMapa.lon, z) - dx, cy = latParaY(vistaMapa.lat, z) - dy;
      // converte de volta para lat/lon
      const nx = cx / (Math.pow(2, z) * TAM_TILE);
      vistaMapa.lon = nx * 360 - 180;
      const ny = cy / (Math.pow(2, z) * TAM_TILE);
      const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * ny)));
      vistaMapa.lat = (latRad * 180) / Math.PI;
      desenhar();
      canvas.style.cursor = "grabbing";
      dica.hidden = true;
    } else {
      canvas.style.cursor = pontoNoEvento(ev) ? "pointer" : "grab";
      const p = pontoNoEvento(ev);
      if (p) {
        const d = p.r.dados;
        const cor = corDe(p.r);
        const linha = (rot: string, val: Valor | string | null | undefined) => (val === null || val === undefined || String(val).trim() === "") ? "" : `<div><span>${rot}</span> ${String(val).replace(/</g, "&lt;")}</div>`;
        const faixa = p.r.faixa_backlog ? `${p.r.faixa_backlog}${p.r.backlog_dias != null ? ` (${fmtDias(p.r.backlog_dias)})` : ""}` : null;
        dica.innerHTML = `<strong class="mono">${awbDe(d)}</strong>`
          + `<div class="mapa-dica-cor"><i class="tom-${cor.tom}"></i> ${cor.chave}</div>`
          + linha("Cidade", d["Consignee City"])
          + linha("Bairro", d["Consignee Area"])
          + linha("CEP", d["Consignee Zip Code"])
          + linha("Entregador", entregadorDe(d))
          + linha("Status", d["Last Scan Status"])
          + linha("Problema", d["Last Problem Type"])
          + (faixa ? linha("Aguardando", faixa) : "")
          + (p.r.erro_piso ? `<div class="mapa-dica-erro">${p.r.erro_piso.tipo}${p.r.erro_piso.esperados.length ? " · deveria: " + p.r.erro_piso.esperados.join(" ou ") : ""}</div>` : "");
        const rect = canvas.getBoundingClientRect();
        const dx = ((lonParaX(p.lon, z) - (lonParaX(vistaMapa.lon, z) - W / 2)) / W) * rect.width;
        const dy = ((latParaY(p.lat, z) - (latParaY(vistaMapa.lat, z) - H / 2)) / H) * rect.height;
        dica.style.left = Math.round(dx) + "px";
        dica.style.top = Math.round(dy) + "px";
        dica.hidden = false;
      } else {
        dica.hidden = true;
      }
    }
  });
  canvas.addEventListener("mouseleave", () => { dica.hidden = true; });
  canvas.addEventListener("click", (ev) => { if (moveu) return; const p = pontoNoEvento(ev); if (p) abrirAwb(awbDe(p.r.dados)); });
  // zoom na roda do mouse, centrado no cursor
  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const nz = Math.max(3, Math.min(18, z + (ev.deltaY < 0 ? 1 : -1)));
    if (nz === z) return;
    z = nz; vistaMapa.z = nz; dica.hidden = true; desenhar();
  }, { passive: false });

  const botao = (rotulo: string, delta: number, aria: string) =>
    h("button", { type: "button", class: "mapa-zoom-btn", "aria-label": aria, on: { click: () => { z = Math.max(3, Math.min(18, z + delta)); vistaMapa.z = z; dica.hidden = true; desenhar(); } } }, rotulo);

  moldura.appendChild(canvas);
  moldura.appendChild(dica);
  moldura.appendChild(h("div", { class: "mapa-zoom" }, botao("+", 1, "Aproximar"), botao("\u2212", -1, "Afastar")) as HTMLElement);
  moldura.appendChild(atrib as HTMLElement);
  // primeira pintura após o elemento entrar no DOM (getComputedStyle precisa estar montado)
  requestAnimationFrame(desenhar);
  return moldura;
}

function telaMapa(): HTMLElement {
  const a = E.analise!; const m = E.mapa;
  const cidades = unicos(a.atual.map((r) => r.dados["Consignee City"] as string));
  const entregadores = unicos(a.atual.map((r) => entregadorDe(r.dados)));
  const doRecorte = a.atual.filter((r) =>
    (!m.cidade || r.dados["Consignee City"] === m.cidade) &&
    (!m.entregador || entregadorDe(r.dados) === m.entregador));
  const pts: PontoMapa[] = doRecorte.map((r) => ({ r, lat: coordenada(r.dados["Consignee Latitude"]), lon: coordenada(r.dados["Consignee Longitude"]) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat !== 0 && p.lon !== 0 && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180);
  const comCoord = new Set(pts.map((p) => awbDe(p.r.dados)));
  const semCoordRegs = doRecorte.filter((r) => !comCoord.has(awbDe(r.dados)));
  const semCoord = semCoordRegs.length;
  const corDe = (r: RegAtual): { chave: string; tom: string } => {
    if (m.cor === "espera") return { chave: r.faixa_backlog || "Sem data", tom: r.faixa_backlog ? TOM_FAIXA[r.faixa_backlog] : "neutro" };
    if (m.cor === "rota") { const f = faixaRota(r) || "Entregue"; return { chave: f, tom: TOM_ROTA[f] || "ok" }; }
    return situacaoMapa(r);
  };
  const ordemLeg = m.cor === "espera" ? ["0-1 dia", "2-3 dias", "4+ dias", "Sem data"] : m.cor === "rota" ? [...FAIXAS_ROTA, "Entregue"] : ["Erro de piso", "Exceção ativa", "Sem alerta"];
  const contagem = new Map<string, { n: number; tom: string }>();
  for (const p of pts) { const cor = corDe(p.r); const c = contagem.get(cor.chave) || { n: 0, tom: cor.tom }; c.n++; contagem.set(cor.chave, c); }

  let mapa: Filho;
  let foraDoQuadro = 0;
  const usarReal = m.modo === "mapa";
  if (!pts.length) {
    mapa = vazio("Sem coordenadas neste recorte", "As encomendas desta seleção não têm latitude e longitude no relatório.");
  } else if (usarReal) {
    // mapa real (tiles do OpenStreetMap). Se os tiles não carregarem (offline / demo),
    // cai automaticamente para o mapa esquemático.
    mapa = mapaCanvas(pts, corDe, () => atualizar(() => { E.mapa.modo = "esquema"; }));
  } else {
    [mapa, foraDoQuadro] = mapaEsquematico(pts, corDe, ordemLeg);
  }

  return h("div", { class: "tela" },
    cabecalho({ area: "Monitorar", titulo: "Mapa", ajuda: "mapa", pergunta: "Onde estão as pendências e onde se concentram os problemas?",
      resposta: h("p", null, h("strong", null, plural(pts.length - foraDoQuadro, "encomenda no mapa", "encomendas no mapa")),
        m.entregador ? ` de ${m.entregador}` : "", m.cidade ? ` em ${m.cidade}` : "",
        semCoord ? ` · ${fmtN(semCoord)} sem coordenadas no relatório` : "", foraDoQuadro ? ` · ${fmtN(foraDoQuadro)} com coordenadas muito distantes das demais (provável erro de endereço)` : "", ".") }),
    h("section", { class: "filtros" }, h("div", { class: "filtros-controles" },
      h("label", { class: "sel-ordem" }, h("span", null, "Cidade"), h("select", { id: "mp-cid", on: { change: (e: Event) => atualizar(() => { m.cidade = (e.target as HTMLSelectElement).value; }) } },
        h("option", { value: "" }, "Todas"), cidades.map((c) => h("option", { value: c, selected: m.cidade === c }, c)))),
      h("label", { class: "sel-ordem" }, h("span", null, "Entregador"), h("select", { id: "mp-ent", on: { change: (e: Event) => atualizar(() => { m.entregador = (e.target as HTMLSelectElement).value; }) } },
        h("option", { value: "" }, "Todos"), entregadores.map((c) => h("option", { value: c, selected: m.entregador === c }, c)))),
      h("label", { class: "sel-ordem" }, h("span", null, "Colorir por"), h("select", { id: "mp-cor", on: { change: (e: Event) => atualizar(() => { m.cor = (e.target as HTMLSelectElement).value as typeof m.cor; }) } },
        h("option", { value: "situacao", selected: m.cor === "situacao" }, "Situação (piso e exceções)"),
        h("option", { value: "espera", selected: m.cor === "espera" }, "Há quanto tempo aguardam"),
        h("option", { value: "rota", selected: m.cor === "rota" }, "Tempo em rota"))))),
    h("figure", { class: "grafico" },
      h("figcaption", null, h("span", { class: "fig-tit" }, h("strong", null, m.cidade ? "Pendências em " + m.cidade : "Pendências por localização"), explica("mapa", "fig")),
        h("span", null, usarReal ? "Cada ponto é uma encomenda pendente. Passe o mouse para ver os detalhes e clique para abrir. Arraste para mover e use a roda ou os botões + / − para aproximar." : "Cada ponto é uma encomenda pendente. Clique para ver os detalhes. Escolha uma cidade para aproximar.")),
      h("ul", { class: "legenda mapa-leg" }, ordemLeg.filter((k) => contagem.has(k)).map((k) => h("li", null, h("i", { class: "tom-" + contagem.get(k)!.tom }), `${k}: ${fmtN(contagem.get(k)!.n)}`))),
      mapa,
      h("p", { class: "nota" }, usarReal
        ? "Mapa de fundo do OpenStreetMap; as posições vêm das coordenadas do relatório. Para navegar pelo teclado, use a lista em "
        : "Sem internet para o mapa de fundo: mostrando as posições de forma esquemática. Para navegar pelo teclado, use a lista em ",
        h("button", { type: "button", class: "link", on: { click: () => navegar("pendencias", { de: "mapa", prep: () => { E.f.pendencias = { ...filtrosVazios().pendencias, cidades: m.cidade ? [m.cidade] : [] }; } }) } }, "Pendências"), "."),
      semCoord ? h("details", { class: "sem-coord" },
        h("summary", null, `${plural(semCoord, "encomenda sem coordenada", "encomendas sem coordenada")} neste recorte (não aparecem no mapa)`),
        tabela({ id: "mp-semcoord", titulo: "Sem coordenada no relatório", linhas: semCoordRegs, chave: (r) => awbDe(r.dados), porPagina: 20, onAbrir: (r) => abrirAwb(awbDe(r.dados)),
          colunas: [
            { id: "awb", rotulo: "Waybill No", valor: (r) => awbDe(r.dados), classe: "mono" },
            { id: "ent", rotulo: "Entregador", valor: (r) => entregadorDe(r.dados) },
            { id: "local", rotulo: "Cidade · bairro", valor: (r) => `${r.dados["Consignee City"] ?? ""} ${r.dados["Consignee Area"] ?? ""}` },
            { id: "cep", rotulo: "CEP", valor: (r) => String(r.dados["Consignee Zip Code"] ?? ""), classe: "mono" },
            { id: "status", rotulo: "Status", valor: (r) => String(r.dados["Last Scan Status"] ?? "") },
            { id: "piso", rotulo: "Piso", valor: (r) => (r.erro_piso ? r.erro_piso.tipo : ""), render: (r) => r.erro_piso ? h("span", { class: "duas" }, chipErro(r.erro_piso.tipo), h("small", null, r.erro_piso.esperados.length ? "deveria: " + r.erro_piso.esperados.join(" ou ") : "")) : h("span", { class: "nulo" }, "—") },
          ],
          exportar: botaoExportar("mapa_sem_coordenada.xlsx", () => ({ linhas: semCoordRegs.map((r) => ({ ...r.dados, erro_piso: r.erro_piso ? r.erro_piso.tipo : "", entregadores_esperados: r.erro_piso ? r.erro_piso.esperados.join(", ") : "" })), colunas: [...COLUNAS_CONTRATO, "erro_piso", "entregadores_esperados"] })) })) : null));
}

// ---------- mapa esquemático (SVG, sem internet) — fallback do mapa real ----------
function mapaEsquematico(pts: PontoMapa[], corDe: (r: RegAtual) => { chave: string; tom: string }, ordemLeg: string[]): [HTMLElement, number] {
  const m = E.mapa;
  let foraDoQuadro = 0;
  // corta 1% de pontos extremos de cada lado para um endereço errado não achatar o mapa
  const corte = (xs: number[]) => { const s = [...xs].sort((p, q) => p - q); const k = Math.floor(s.length * 0.01); return [s[k], s[s.length - 1 - k]]; };
  const [la0, la1] = corte(pts.map((p) => p.lat)), [lo0, lo1] = corte(pts.map((p) => p.lon));
  const kx = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
  const largura = Math.max(1e-4, (lo1 - lo0) * kx), altura = Math.max(1e-4, la1 - la0);
  const W = 800, H = Math.max(260, Math.min(620, Math.round(W * (altura / largura)))), P = 18;
  const esc = Math.min((W - 2 * P) / largura, (H - 2 * P) / altura);
  const ox = (W - largura * esc) / 2, oy = (H - altura * esc) / 2;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("class", "mapa-svg");
  svg.setAttribute("aria-label", `Mapa com ${pts.length} encomendas pendentes. Use a lista em Pendências para navegar pelo teclado.`); svg.setAttribute("role", "img");
  // rótulos de cidade no centro de cada grupo (só na visão geral)
  if (!m.cidade) {
    const centros = new Map<string, { lat: number; lon: number; n: number }>();
    for (const p of pts) { const c = String(p.r.dados["Consignee City"]); const x = centros.get(c) || { lat: 0, lon: 0, n: 0 }; x.lat += p.lat; x.lon += p.lon; x.n++; centros.set(c, x); }
    for (const [c, x] of centros) {
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", String(ox + (x.lon / x.n - lo0) * kx * esc)); t.setAttribute("y", String(oy + (la1 - x.lat / x.n) * esc - 10));
      t.setAttribute("class", "mapa-cidade"); t.setAttribute("text-anchor", "middle"); t.textContent = c; svg.appendChild(t);
    }
  }
  const ordem = [...pts].sort((p, q) => ordemLeg.indexOf(corDe(q.r).chave) - ordemLeg.indexOf(corDe(p.r).chave));
  for (const p of ordem) {
    const cx = ox + (p.lon - lo0) * kx * esc, cy = oy + (la1 - p.lat) * esc;
    if (cx < -20 || cy < -20 || cx > W + 20 || cy > H + 20) { foraDoQuadro++; continue; }
    const c = document.createElementNS(ns, "circle");
    const cor = corDe(p.r);
    c.setAttribute("cx", cx.toFixed(1)); c.setAttribute("cy", cy.toFixed(1)); c.setAttribute("r", "4.5");
    c.setAttribute("class", "mapa-ponto seg-" + cor.tom + (E.drawer === awbDe(p.r.dados) ? " sel" : ""));
    const t = document.createElementNS(ns, "title");
    t.textContent = `${awbDe(p.r.dados)} · ${p.r.dados["Consignee City"]}${p.r.dados["Consignee Area"] ? " · " + p.r.dados["Consignee Area"] : ""} · ${entregadorDe(p.r.dados)} · ${cor.chave}`;
    c.appendChild(t);
    c.addEventListener("click", () => abrirAwb(awbDe(p.r.dados)));
    svg.appendChild(c);
  }
  return [h("div", { class: "mapa-moldura" }, svg), foraDoQuadro];
}
