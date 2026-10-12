// Utilitários de interface: criação de elementos, formatação, ícones, CSV.

type Filho = Node | string | number | null | undefined | false | Filho[];
type Attrs = Record<string, unknown> & { class?: string; on?: Record<string, (e: any) => void> };

function h(tag: string, attrs: Attrs | null = null, ...filhos: Filho[]): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "on") for (const [ev, fn] of Object.entries(v as Record<string, any>)) el.addEventListener(ev, fn);
    else if (k === "html") el.innerHTML = String(v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k in el && k !== "list" && k !== "form" && typeof v !== "string") (el as any)[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  anexar(el, filhos);
  return el;
}
function anexar(el: Node, filhos: Filho[]) {
  for (const f of filhos) {
    if (f === null || f === undefined || f === false) continue;
    if (Array.isArray(f)) anexar(el, f);
    else el.appendChild(typeof f === "object" ? f : document.createTextNode(String(f)));
  }
}

// ---------- formatação ----------
const NF = new Intl.NumberFormat("pt-BR");
const fmtN = (n: number) => NF.format(n);
const fmtPct = (n: number) => NF.format(Math.round(n * 10) / 10) + "%";
function fmtData(v: Valor | undefined, comHora = true): string {
  const d = paraData(v ?? null); if (!d) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  const base = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  return comHora ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base;
}
const fmtDia = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
function fmtDias(v: number | null): string {
  if (v === null) return "sem data de chegada";
  if (v < 1) return `${Math.max(0, Math.round(v * 24))} h`;
  return `${NF.format(Math.round(v * 10) / 10)} dias`;
}
function fmtMin(m: number | null): string {
  if (m === null) return "—";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${NF.format(Math.round((m / 1440) * 10) / 10)} dias`;
}
const plural = (n: number, um: string, varios: string) => `${fmtN(n)} ${n === 1 ? um : varios}`;

// Rótulos em português para as colunas originais (equivale ao ROTULOS_PT do MVP).
const ROTULOS: Record<string, string> = {
  "Waybill No": "Código (AWB)", "Reference No": "Referência", "Last Scan Status": "Status atual",
  "Last Problem Type": "Tipo de problema", "Last Problem Reason": "Motivo do problema", "Last Problem Date": "Data do problema",
  "Consignee City": "Cidade", "Consignee Area": "Bairro", "Consignee Address": "Endereço", "Consignee Zip Code": "CEP",
  "Delivery Associate": "Entregador", "Delivery Count": "Tentativas", "Delivery Time": "Saída para entrega",
  "Arrival Time": "Chegada ao galpão", "Waybill Hold Time": "Tempo em espera", "Estimated Delivery Time": "Previsão de entrega",
  "Dispatch Station": "Estação", "Consignee Route Code": "Rota", "Sign Date": "Entrega confirmada em",
  "Consignee Latitude": "Latitude", "Consignee Longitude": "Longitude",
};
const VAZIO: Record<string, string> = {
  "Delivery Associate": "Sem entregador", "Last Problem Type": "Sem problema registrado", "Last Problem Reason": "Sem motivo informado",
  "Consignee Area": "Bairro não informado", "Arrival Time": "Sem data de chegada", "Delivery Time": "Sem saída registrada", "Sign Date": "Sem entrega confirmada",
  "Last Scan Status": "Sem status", "Delivery Count": "Não informado",
};
function valorTexto(col: string, v: Valor | undefined): string {
  if (v === null || v === undefined || String(v).trim() === "") return VAZIO[col] || "Não informado";
  if (/Time|Date/.test(col)) return fmtData(v) || String(v);
  return String(v);
}

// ---------- ícones (traço 1.75, 20px) ----------
const ICONES: Record<string, string> = {
  torre: '<path d="M4 20h16M7 20V10l5-6 5 6v10M10 20v-5h4v5"/>',
  piso: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/>',
  alerta: '<path d="M12 3l9.5 17h-19L12 3z"/><path d="M12 10v4M12 17.5v.01"/>',
  pendencias: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 14h3M8 17h6"/>',
  entregador: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  mudou: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  fora: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  regras: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>',
  importar: '<path d="M12 3v12M7 10l5 5 5-5M4 19h16"/>',
  busca: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  baixar: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>',
  voltar: '<path d="M15 5l-7 7 7 7"/>',
  seta: '<path d="M9 5l7 7-7 7"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  critico: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  inferido: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 2.5"/><path d="M9.8 9.5a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.4M12 16.5v.01"/>',
  arquivo: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  trocar: '<path d="M7 4L4 7l3 3M4 7h12M17 20l3-3-3-3M20 17H8"/>',
  filtro: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  mapa: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  roteiro: '<path d="M9 5h11M9 12h11M9 19h11"/><path d="M4 5.5l1 1 2-2M4 12.5l1 1 2-2M4 19.5l1 1 2-2"/>',
};
function icone(nome: string, cls = "ic"): HTMLElement {
  const s = document.createElement("span");
  s.className = cls; s.setAttribute("aria-hidden", "true");
  s.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome] || ""}</svg>`;
  return s;
}

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function salvarArquivo(nome: string, conteudo: string | Uint8Array): Promise<"salvo" | "cancelado" | "erro"> {
  const binario = conteudo instanceof Uint8Array;
  const mime = binario ? MIME_XLSX : "text/csv;charset=utf-8";
  const c = (globalThis as any).claude;
  if (c && typeof c.use === "function") {
    const dl = await c.use("downloads").catch(() => null);
    if (dl) {
      try { await dl.save({ filename: nome, data: conteudo }); return "salvo"; }
      catch (e: any) { return e && e.code === "declined" ? "cancelado" : "erro"; }
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([conteudo], { type: mime }));
    const a = h("a", { href: url, download: nome }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return "salvo";
  } catch { return "erro"; }
}

// ---------- avisos rápidos ----------
function aviso(texto: string, tom: "ok" | "erro" | "info" = "ok") {
  let area = document.getElementById("avisos");
  if (!area) { area = h("div", { id: "avisos", class: "avisos", role: "status", "aria-live": "polite" }); document.body.appendChild(area); }
  const el = h("div", { class: "aviso aviso-" + tom }, icone(tom === "erro" ? "critico" : tom === "ok" ? "ok" : "info"), h("span", null, texto));
  area.appendChild(el);
  while (area.children.length > 3) area.firstElementChild!.remove();
  setTimeout(() => { el.classList.add("saindo"); setTimeout(() => el.remove(), 300); }, 3800);
}

const normalizarBusca = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ---------- recorte de tabela (busca livre + filtros de coluna) ----------
// Funções puras, sem DOM, para serem testáveis isoladamente e reusadas pela tabela.
// `acessar(linha, colId)` devolve o valor bruto da célula; filtros guardam, por
// coluna, o conjunto de valores (texto canônico) que devem ficar DE FORA.

function textoCanonico(v: string | number | null | undefined): string {
  return v === null || v === undefined || String(v).trim() === "" ? "" : String(v);
}

function distintosDe<T>(linhas: T[], acessar: (r: T) => string | number | null): string[] {
  return Array.from(new Set(linhas.map((r) => textoCanonico(acessar(r)))))
    .sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "pt-BR", { numeric: true })));
}

function passaRecorte<T>(
  r: T,
  colunas: { id: string; valor: (r: T) => string | number | null }[],
  busca: string,
  filtros: Record<string, Set<string>>,
): boolean {
  const q = normalizarBusca(busca);
  if (q && !colunas.some((c) => normalizarBusca(String(c.valor(r) ?? "")).includes(q))) return false;
  for (const c of colunas) {
    const excl = filtros[c.id];
    if (excl && excl.size && excl.has(textoCanonico(c.valor(r)))) return false;
  }
  return true;
}
