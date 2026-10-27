// Camada de serviços. A interface só conversa com `Servico`.
//  - ServicoApi: usa a API Python (fonte de verdade) quando /api/saude responde.
//  - ServicoLocal: motor local (paridade testada) para demonstração sem servidor.
// Persistência (justificativas e ajustes de regras):
//  - API: arquivos JSON no servidor (como o MVP).
//  - Local: banco do artefato (compartilhado com quem tem acesso) quando disponível;
//    senão, apenas este navegador.

type Persistencia = "servidor" | "compartilhada" | "navegador" | "sessao" | "memoria";

interface Servico {
  modo: "python" | "local";
  persistencia: Persistencia;
  receber(arquivo: File): Promise<ValidacaoArquivo>;
  exemplos(): Promise<{ base: ValidacaoArquivo; atual: ValidacaoArquivo } | null>;
  verificarOrdem(base: ValidacaoArquivo, atual: ValidacaoArquivo): Promise<Analise["ordem"]>;
  analisar(base: ValidacaoArquivo, atual: ValidacaoArquivo, p: ParametrosAnalise): Promise<Analise>;
  desempenho(dias: string[]): Promise<Desempenho>;
  obterRegras(): Promise<Overrides>;
  salvarRegras(ov: Overrides): Promise<Overrides>;
  justificar(awb: string, j: Omit<Justificativa, "criada_em">): Promise<Record<string, Justificativa>>;
  reativar(awb: string): Promise<Record<string, Justificativa>>;
  simular(atual: ConfigRegras, novo: ConfigRegras): Promise<Simulacao>;
  // Modo Estudo/Validação por região (CEP). Operam sobre uma planilha só.
  derivarRegiao(arquivo: ValidacaoArquivo, limiar: number): Promise<MapaRegiao>;
  validarRegiao(arquivo: ValidacaoArquivo, mapa: MapaRegiao): Promise<ErroRegiaoReg[]>;
  listarImportacoes(): Promise<RegistroImportacao[]>;
  registrarImportacao(r: RegistroImportacao): Promise<RegistroImportacao[]>;
}

const MAX_HISTORICO = 60;
function inserirNoHistorico(hist: RegistroImportacao[], r: RegistroImportacao): RegistroImportacao[] {
  const h = hist.filter((x) => x.chave !== r.chave); h.push(r);
  h.sort((a, b) => (a.referencia < b.referencia ? -1 : a.referencia > b.referencia ? 1 : 0));
  return h.slice(-MAX_HISTORICO);
}

class ErroServico extends Error {
  problema: ProblemaArquivo;
  constructor(p: ProblemaArquivo) { super(p.titulo); this.problema = p; }
}

function problemaDe(e: unknown): ProblemaArquivo {
  if (e instanceof ErroServico || e instanceof ErroLeitura) return e.problema;
  return { titulo: "Não foi possível concluir a operação", significado: "Ocorreu uma falha inesperada. Nenhum dado foi alterado.", acao: "Tente novamente. Se o problema continuar, envie os arquivos ao suporte." };
}

// ---------- API ----------
class ServicoApi implements Servico {
  modo = "python" as const;
  persistencia: Persistencia = "servidor";
  idAnalise = "";
  private async req<T>(url: string, init?: RequestInit): Promise<T> {
    let r: Response;
    try { r = await fetch(url, init); } catch {
      throw new ErroServico({ titulo: "Sem conexão com o servidor", significado: "A análise depende do servidor de processamento, que não respondeu.", acao: "Verifique a conexão e tente de novo." });
    }
    const corpo = await r.json().catch(() => null);
    if (!r.ok) throw new ErroServico(corpo && corpo.titulo ? corpo : problemaDe(null));
    return corpo as T;
  }
  private tabelasRegiao = new Map<string, Tabela>();
  async receber(arquivo: File) {
    const f = new FormData(); f.append("arquivo", arquivo);
    // O servidor valida e o navegador lê uma cópia local para o Modo Estudo/Validação (cálculo client-side).
    // As duas leituras andam EM PARALELO: antes eram uma depois da outra e os tempos se somavam.
    const local = arquivo.arrayBuffer().then((b) => lerPlanilhaXlsx(b)).catch(() => null);
    const info = await this.req<ValidacaoArquivo>("/api/arquivos", { method: "POST", body: f });
    if (info.token) { const t = await local; if (t) this.tabelasRegiao.set(info.token, t); }
    return info;
  }
  exemplos() { return this.req<{ base: ValidacaoArquivo; atual: ValidacaoArquivo }>("/api/exemplos", { method: "POST" }); }
  private json(m: string, corpo: unknown): RequestInit { return { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }; }
  verificarOrdem(b: ValidacaoArquivo, a: ValidacaoArquivo) { return this.req<Analise["ordem"]>("/api/ordem", this.json("POST", { token_base: b.token, token_atual: a.token })); }
  async analisar(b: ValidacaoArquivo, a: ValidacaoArquivo, p: ParametrosAnalise) {
    const r = await this.req<Analise>("/api/analises", this.json("POST", { token_base: b.token, token_atual: a.token, parametros: p }));
    this.idAnalise = r.id || ""; return r;
  }
  desempenho(dias: string[]) { const q = dias.map((d) => "dias=" + encodeURIComponent(d)).join("&"); return this.req<Desempenho>(`/api/analises/${this.idAnalise}/desempenho?${q}`); }
  obterRegras() { return this.req<Overrides>("/api/regras"); }
  salvarRegras(ov: Overrides) { return this.req<Overrides>("/api/regras", this.json("PUT", ov)); }
  justificar(awb: string, j: Omit<Justificativa, "criada_em">) { return this.req<Record<string, Justificativa>>(`/api/justificativas/${encodeURIComponent(awb)}`, this.json("PUT", j)); }
  reativar(awb: string) { return this.req<Record<string, Justificativa>>(`/api/justificativas/${encodeURIComponent(awb)}`, { method: "DELETE" }); }
  simular(atual: ConfigRegras, novo: ConfigRegras) { return this.req<Simulacao>(`/api/analises/${this.idAnalise}/simular-regras`, this.json("POST", { atual, novo })); }
  listarImportacoes() { return this.req<RegistroImportacao[]>("/api/historico"); }
  registrarImportacao(r: RegistroImportacao) { return this.req<RegistroImportacao[]>("/api/historico", this.json("POST", r)); }
  private tabelaRegiao(a: ValidacaoArquivo): Tabela {
    const t = a.token ? this.tabelasRegiao.get(a.token) : null;
    if (!t) throw new ErroServico({ titulo: "Arquivo não encontrado", significado: "O arquivo não está mais carregado nesta página.", acao: "Envie a planilha novamente." });
    return t;
  }
  async derivarRegiao(a: ValidacaoArquivo, limiar: number) { return derivarRegiaoLocal(prepRegiao(this.tabelaRegiao(a)), limiar); }
  async validarRegiao(a: ValidacaoArquivo, mapa: MapaRegiao) { return validarRegiaoLocal(prepRegiao(this.tabelaRegiao(a)), mapa); }
}

// ---------- Local ----------
interface Repositorio {
  tipo: Persistencia;
  lerJust(): Promise<Record<string, Justificativa>>;
  gravarJust(awb: string, j: Justificativa | null): Promise<void>;
  lerRegras(): Promise<Overrides>;
  gravarRegras(ov: Overrides): Promise<void>;
  lerHistorico(): Promise<RegistroImportacao[]>;
  gravarImportacao(r: RegistroImportacao): Promise<RegistroImportacao[]>;
}

const OV_VAZIO = (): Overrides => ({ por_cidade: {}, cidades_ignoradas: [], cidades_sem_prazo: null });

// Modo efêmero (build --publico): nada é gravado em lugar nenhum. Tudo vive só
// nesta aba e some ao fechar/recarregar. Sem localStorage para dados, sem servidor, sem custo (preferências de tela: 06d_prefs.ts).
// `regrasBase` (opcional) são as regras de piso versionadas no GitHub, lidas ao abrir;
// a aplicação só lê — nunca escreve de volta no repositório.
function repoMemoria(regrasBase?: Overrides | null): Repositorio {
  const mem: { j: Record<string, Justificativa>; r: Overrides | null; h: RegistroImportacao[] } = { j: {}, r: regrasBase || null, h: [] };
  return {
    tipo: "sessao",
    async lerJust() { return mem.j; },
    async gravarJust(awb, j) { if (j) mem.j[awb] = j; else delete mem.j[awb]; },
    async lerRegras() { return mem.r || OV_VAZIO(); },
    async gravarRegras(ov) { mem.r = ov; },
    async lerHistorico() { return mem.h; },
    async gravarImportacao(r) { mem.h = inserirNoHistorico(mem.h, r); return mem.h; },
  };
}

// Lê as regras de piso publicadas junto do site (mesmo origem, sem CORS).
// Só leitura: GitHub -> aplicação. Se o arquivo não existir ou vier inválido, ignora.
async function lerRegrasPublicadas(): Promise<Overrides | null> {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch("./regras_piso.json", { signal: ctl.signal, cache: "no-store" }); clearTimeout(t);
    if (!r.ok) return null;
    const v = await r.json();
    if (!v || typeof v !== "object") return null;
    return { por_cidade: (v.por_cidade && typeof v.por_cidade === "object") ? v.por_cidade : {},
             cidades_ignoradas: Array.isArray(v.cidades_ignoradas) ? v.cidades_ignoradas : [],
             cidades_sem_prazo: Array.isArray(v.cidades_sem_prazo) ? v.cidades_sem_prazo : null };
  } catch { return null; }
}

function repoNavegador(): Repositorio {
  const ler = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* armazenamento indisponível */ } };
  let ok = true; try { localStorage.setItem("cio:t", "1"); localStorage.removeItem("cio:t"); } catch { ok = false; }
  const mem: Record<string, unknown> = {};
  return {
    tipo: ok ? "navegador" : "memoria",
    async lerJust() { return (ok ? ler("cio:justificativas") : mem.j) || {}; },
    async gravarJust(awb, j) {
      const d = (ok ? ler("cio:justificativas") : mem.j) || {};
      if (j) d[awb] = j; else delete d[awb];
      ok ? gravar("cio:justificativas", d) : (mem.j = d);
    },
    async lerRegras() { return (ok ? ler("cio:regras") : mem.r) || OV_VAZIO(); },
    async gravarRegras(ov) { ok ? gravar("cio:regras", ov) : (mem.r = ov); },
    async lerHistorico() { return ((ok ? ler("cio:historico") : mem.h) || []) as RegistroImportacao[]; },
    async gravarImportacao(r) {
      const h = inserirNoHistorico(((ok ? ler("cio:historico") : mem.h) || []) as RegistroImportacao[], r);
      ok ? gravar("cio:historico", h) : (mem.h = h); return h;
    },
  };
}

// Documento por AWB em "justificativas/<awb>"; regras em "config/regras_piso".
function idSeguro(awb: string) { return awb.replace(/[^A-Za-z0-9_\-.~:@+]/g, (c) => "~" + c.charCodeAt(0).toString(16)); }

async function repoArtefato(): Promise<Repositorio | null> {
  const c = (globalThis as any).claude;
  if (!c || typeof c.use !== "function") return null;
  const db = await Promise.race([c.use("db"), new Promise((r) => setTimeout(() => r(null), 4000))]) as any;
  if (!db) return null;
  try { await db.doc("config/regras_piso").get(); } catch { return null; }
  const lerHistoricoDb = async (): Promise<RegistroImportacao[]> => {
    const s = await db.collection("importacoes").limit(1000).get();
    const h = s.docs.map((d: any) => d.data()).filter((v: any) => v && v.chave) as RegistroImportacao[];
    return h.sort((a, b) => (a.referencia < b.referencia ? -1 : a.referencia > b.referencia ? 1 : 0));
  };
  return {
    tipo: "compartilhada",
    async lerJust() {
      const s = await db.collection("justificativas").limit(1000).get();
      const out: Record<string, Justificativa> = {};
      for (const d of s.docs) { const v = d.data(); if (v && v.awb) out[v.awb] = { motivo: v.motivo, observacao: v.observacao || "", reavaliar_em: v.reavaliar_em || "", criada_em: v.criada_em || "" }; }
      return out;
    },
    async gravarJust(awb, j) {
      const ref = db.doc("justificativas/" + idSeguro(awb));
      if (j) await ref.set({ awb, ...j }); else await ref.delete();
    },
    async lerRegras() {
      const s = await db.doc("config/regras_piso").get();
      const v = s.exists ? s.data() : null;
      return v ? { por_cidade: v.por_cidade || {}, cidades_ignoradas: v.cidades_ignoradas || [], cidades_sem_prazo: Array.isArray(v.cidades_sem_prazo) ? v.cidades_sem_prazo : null } : OV_VAZIO();
    },
    async gravarRegras(ov) { await db.doc("config/regras_piso").set(ov as any); },
    lerHistorico: lerHistoricoDb,
    async gravarImportacao(r) {
      await db.doc("importacoes/" + idSeguro(r.chave)).set(r as any);
      const h = await lerHistoricoDb();
      for (const velho of h.slice(0, Math.max(0, h.length - MAX_HISTORICO))) await db.doc("importacoes/" + idSeguro(velho.chave)).delete();
      return h.slice(-MAX_HISTORICO);
    },
  };
}

class ServicoLocal implements Servico {
  modo = "local" as const;
  persistencia: Persistencia;
  private repo: Repositorio;
  private tabelas = new Map<string, Tabela>();
  private ctx: ContextoLocal | null = null;
  constructor(repo: Repositorio) { this.repo = repo; this.persistencia = repo.tipo; }

  private registrar(nome: string, t: Tabela): ValidacaoArquivo {
    const info = validarTabela(t, nome);
    const token = "local-" + Math.random().toString(36).slice(2);
    if (!info.problemas.length) { this.tabelas.set(token, t); info.token = token; } else info.token = null;
    return info;
  }
  async receber(arquivo: File) {
    if (!/\.xlsx$/i.test(arquivo.name)) throw new ErroServico({ titulo: "Formato não aceito", significado: "Só relatórios Excel (.xlsx) exportados do Dispatch são aceitos.", acao: "Exporte o relatório em .xlsx e envie novamente." });
    if (arquivo.size > 20 * 1024 * 1024) throw new ErroServico({ titulo: "Arquivo muito grande", significado: "O limite é 20 MB por relatório.", acao: "Exporte um período menor." });
    const t = await lerPlanilhaXlsx(await arquivo.arrayBuffer());
    return this.registrar(arquivo.name, t);
  }
  async exemplos() {
    if (EFEMERO || !EXEMPLO_EMBUTIDO) return null;
    const dec = (b64: string) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
    const ex = EXEMPLO_EMBUTIDO as { base: { nome: string; b64: string }; atual: { nome: string; b64: string } };
    return {
      base: this.registrar(ex.base.nome, await lerPlanilhaXlsx(dec(ex.base.b64))),
      atual: this.registrar(ex.atual.nome, await lerPlanilhaXlsx(dec(ex.atual.b64))),
    };
  }
  private tabela(v: ValidacaoArquivo) {
    const t = v.token ? this.tabelas.get(v.token) : null;
    if (!t) throw new ErroServico({ titulo: "Arquivo não encontrado", significado: "O arquivo não está mais carregado nesta página.", acao: "Envie os relatórios novamente." });
    return t;
  }
  async verificarOrdem(b: ValidacaoArquivo, a: ValidacaoArquivo) {
    return indicioOrdem(normalizarRelatorio(this.tabela(b)), normalizarRelatorio(this.tabela(a)));
  }
  async analisar(b: ValidacaoArquivo, a: ValidacaoArquivo, p: ParametrosAnalise) {
    const [ov, just] = await Promise.all([this.repo.lerRegras(), this.repo.lerJust()]);
    const { analise, ctx } = analisarLocal(this.tabela(b), this.tabela(a), p, ov, just, [b.nome, a.nome]);
    this.ctx = ctx; return analise;
  }
  async desempenho(dias: string[]) { if (!this.ctx) throw new ErroServico(problemaDe(null)); return desempenhoLocal(this.ctx.baseF, this.ctx.ultF, dias); }
  obterRegras() { return this.repo.lerRegras(); }
  async salvarRegras(ov: Overrides) {
    const limpo: Overrides = { por_cidade: {}, cidades_ignoradas: [...new Set(ov.cidades_ignoradas)].sort(), cidades_sem_prazo: Array.isArray(ov.cidades_sem_prazo) ? [...new Set(ov.cidades_sem_prazo)].sort() : null };
    for (const [c, e] of Object.entries(ov.por_cidade)) limpo.por_cidade[c] = [...new Set(e)].sort();
    await this.repo.gravarRegras(limpo); return limpo;
  }
  async justificar(awb: string, j: Omit<Justificativa, "criada_em">) {
    if (!j.motivo.trim()) throw new ErroServico({ titulo: "Informe um motivo", significado: "A justificativa precisa de um motivo para ser registrada.", acao: "Escreva em poucas palavras por que o alerta pode ser silenciado." });
    await this.repo.gravarJust(awb, { motivo: j.motivo.trim(), observacao: j.observacao.trim(), reavaliar_em: j.reavaliar_em, criada_em: dataHoraIso(new Date()).replace(" ", "T") });
    return this.repo.lerJust();
  }
  async reativar(awb: string) { await this.repo.gravarJust(awb, null); return this.repo.lerJust(); }
  async simular(atual: ConfigRegras, novo: ConfigRegras) {
    if (!this.ctx) throw new ErroServico(problemaDe(null));
    return simularRegrasLocal(this.ctx.baseF, this.ctx.ultF, atual, novo);
  }
  listarImportacoes() { return this.repo.lerHistorico(); }
  registrarImportacao(r: RegistroImportacao) { return this.repo.gravarImportacao(r); }
  async derivarRegiao(arquivo: ValidacaoArquivo, limiar: number) {
    return derivarRegiaoLocal(prepRegiao(this.tabela(arquivo)), limiar);
  }
  async validarRegiao(arquivo: ValidacaoArquivo, mapa: MapaRegiao) {
    return validarRegiaoLocal(prepRegiao(this.tabela(arquivo)), mapa);
  }
}

async function criarServico(): Promise<Servico> {
  if (EFEMERO) return new ServicoLocal(repoMemoria(await lerRegrasPublicadas()));
  if (location.protocol.startsWith("http")) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch("/api/saude", { signal: ctl.signal }); clearTimeout(t);
      if (r.ok && (await r.json()).motor === "python") return new ServicoApi();
    } catch { /* sem API: modo local */ }
  }
  return new ServicoLocal((await repoArtefato()) || repoNavegador());
}
