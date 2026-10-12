// Leitor mínimo de .xlsx (primeira planilha), sem dependências externas.
// Usa o descompactador nativo do navegador (DecompressionStream).
// Equivalente ao pd.read_excel(fonte) do MVP: lê a primeira aba, 1ª linha = cabeçalho.

class ErroLeitura extends Error {
  problema: ProblemaArquivo;
  constructor(p: ProblemaArquivo) { super(p.titulo); this.problema = p; }
}

async function inflarRaw(dados: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([dados]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function lerZip(buf: ArrayBuffer): Promise<Map<string, () => Promise<string>>> {
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ErroLeitura({
    titulo: "Arquivo danificado ou não é Excel",
    significado: "O conteúdo não corresponde a uma planilha .xlsx.",
    acao: "Abra o arquivo no Excel, salve como .xlsx e envie novamente.",
  });
  const total = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder("utf-8");
  const entradas = new Map<string, () => Promise<string>>();
  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const metodo = v.getUint16(p + 10, true);
    const tamComp = v.getUint32(p + 20, true);
    const lenNome = v.getUint16(p + 28, true);
    const lenExtra = v.getUint16(p + 30, true);
    const lenCom = v.getUint16(p + 32, true);
    const offLocal = v.getUint32(p + 42, true);
    const nome = dec.decode(u8.subarray(p + 46, p + 46 + lenNome));
    p += 46 + lenNome + lenExtra + lenCom;
    entradas.set(nome, async () => {
      const ln = v.getUint16(offLocal + 26, true);
      const le = v.getUint16(offLocal + 28, true);
      const ini = offLocal + 30 + ln + le;
      const bruto = u8.subarray(ini, ini + tamComp);
      const dados = metodo === 0 ? bruto : await inflarRaw(bruto);
      return dec.decode(dados);
    });
  }
  return entradas;
}

function decodificarXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, e: string) => {
    if (e === "amp") return "&"; if (e === "lt") return "<"; if (e === "gt") return ">";
    if (e === "quot") return '"'; if (e === "apos") return "'";
    return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}

function textoDe(xml: string): string {
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += m[1] ?? "";
  return decodificarXml(out);
}

function colunaParaIndice(ref: string): number {
  let n = 0;
  for (const ch of ref) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + (c - 64); }
  return n - 1;
}

const FORMATOS_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function serialParaTexto(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

interface Planilha { colunas: string[]; linhas: Dados[] }

async function lerPlanilhaXlsx(buf: ArrayBuffer): Promise<Planilha> {
  const zip = await lerZip(buf);
  const ler = async (n: string) => { const f = zip.get(n); return f ? f() : null; };

  // primeira aba, como o pd.read_excel padrão
  let alvo = "xl/worksheets/sheet1.xml";
  const wb = await ler("xl/workbook.xml");
  const rels = await ler("xl/_rels/workbook.xml.rels");
  if (wb && rels) {
    const m = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb);
    if (m) {
      const r = new RegExp(`<Relationship\\b[^>]*Id="${m[1]}"[^>]*Target="([^"]+)"`).exec(rels)
        || new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${m[1]}"`).exec(rels);
      if (r) alvo = r[1].startsWith("/") ? r[1].slice(1) : "xl/" + r[1].replace(/^\.\//, "");
    }
  }
  const sheet = await ler(alvo);
  if (!sheet) throw new ErroLeitura({
    titulo: "Não foi possível ler a planilha",
    significado: "O arquivo .xlsx não tem uma aba de dados reconhecível.",
    acao: "Confira se é o relatório Dispatch original, sem edições manuais.",
  });

  const compartilhadas: string[] = [];
  const sst = await ler("xl/sharedStrings.xml");
  if (sst) { const re = /<si>([\s\S]*?)<\/si>/g; let m; while ((m = re.exec(sst))) compartilhadas.push(textoDe(m[1])); }

  const estiloData: boolean[] = [];
  const estilos = await ler("xl/styles.xml");
  if (estilos) {
    const custom = new Map<number, string>();
    const reF = /<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g; let m;
    while ((m = reF.exec(estilos))) custom.set(+m[1], decodificarXml(m[2]));
    const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos);
    if (xfs) {
      const reX = /<xf\b([^>]*)\/?>/g;
      while ((m = reX.exec(xfs[1]))) {
        const id = +((/numFmtId="(\d+)"/.exec(m[1]) || [])[1] || 0);
        const cod = custom.get(id);
        estiloData.push(FORMATOS_DATA.has(id) || (!!cod && /[dy]|h:mm/i.test(cod.replace(/"[^"]*"|\[[^\]]*\]/g, ""))));
      }
    }
  }

  const grade: Valor[][] = [];
  const reRow = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  const reCel = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let mr: RegExpExecArray | null;
  while ((mr = reRow.exec(sheet))) {
    const linha: Valor[] = [];
    const corpo = mr[1] || "";
    let mc: RegExpExecArray | null; let pos = 0;
    reCel.lastIndex = 0;
    while ((mc = reCel.exec(corpo))) {
      const attrs = mc[1]; const dentro = mc[2] || "";
      const ref = (/\br="([A-Z]+)\d+"/.exec(attrs) || [])[1];
      const idx = ref ? colunaParaIndice(ref) : pos;
      pos = idx + 1;
      const t = (/\bt="([^"]+)"/.exec(attrs) || [])[1] || "n";
      const s = +((/\bs="(\d+)"/.exec(attrs) || [])[1] || 0);
      const vm = /<v>([\s\S]*?)<\/v>/.exec(dentro);
      let val: Valor = null;
      if (t === "inlineStr") val = textoDe(dentro);
      else if (t === "s") val = vm ? (compartilhadas[+vm[1]] ?? null) : null;
      else if (t === "str" || t === "e") val = vm ? decodificarXml(vm[1]) : null;
      else if (t === "b") val = vm ? (vm[1] === "1" ? "True" : "False") : null;
      else if (vm) {
        const num = Number(vm[1]);
        val = estiloData[s] ? serialParaTexto(num) : (Number.isFinite(num) ? num : vm[1]);
      }
      if (val === "") val = null; // células vazias viram nulas, como no pandas
      linha[idx] = val;
    }
    grade.push(linha);
  }
  if (!grade.length) return { colunas: [], linhas: [] };
  const colunas = (grade[0] || []).map((c, i) => (c === null || c === undefined ? `Unnamed: ${i}` : String(c)));
  const linhas: Dados[] = [];
  for (let i = 1; i < grade.length; i++) {
    const g = grade[i]; const d: Dados = {};
    let vazia = true;
    colunas.forEach((c, j) => { const x = g[j] ?? null; d[c] = x; if (x !== null) vazia = false; });
    if (!vazia) linhas.push(d);
  }
  return { colunas, linhas };
}
