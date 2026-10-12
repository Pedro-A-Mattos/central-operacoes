// Escritor mínimo de .xlsx (uma planilha), sem dependências externas.
// Simétrico ao leitor em 02_xlsx.ts: gera um ZIP "stored" (método 0, sem
// compressão) que o próprio leitor consegue reabrir. Todas as células são
// escritas como texto (inlineStr) para preservar fielmente o contrato do
// relatório Dispatch — evita que o Excel reinterprete AWB como notação
// científica ou converta datas. Equivale, em intenção, ao df.to_excel do
// backend, mas roda 100% no navegador (funciona com e sem API, offline).

// ---------- CRC-32 (exigido pelo formato ZIP) ----------
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- escape de texto para XML ----------
function escaparXml(v: Valor | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // remove caracteres de controle que o XML não aceita (exceto tab/nl/cr)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

// A1, B1, ... Z1, AA1 ... a partir do índice de coluna (0-based) e da linha (1-based).
function refCelula(col: number, linha: number): string {
  let s = "";
  let n = col + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s + linha;
}

function montarPlanilhaXml(linhas: Dados[], colunas: string[]): string {
  const esc = escaparXml;
  const celula = (col: number, lin: number, texto: Valor | undefined) => {
    const t = esc(texto);
    if (t === "") return "";
    return `<c r="${refCelula(col, lin)}" t="inlineStr"><is><t xml:space="preserve">${t}</t></is></c>`;
  };
  const partes: string[] = [];
  // linha 1: cabeçalho com os nomes de coluna originais (RN-022)
  partes.push(`<row r="1">${colunas.map((c, j) => celula(j, 1, c)).join("")}</row>`);
  // demais linhas
  for (let i = 0; i < linhas.length; i++) {
    const lin = i + 2;
    const cels = colunas.map((c, j) => celula(j, lin, linhas[i][c])).join("");
    partes.push(`<row r="${lin}">${cels}</row>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${partes.join("")}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
  + `<Default Extension="xml" ContentType="application/xml"/>`
  + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
  + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  + `</Types>`;

const RELS_RAIZ = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
  + `</Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" `
  + `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
  + `<sheets><sheet name="Dados" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const RELS_WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`
  + `</Relationships>`;

// ---------- empacotamento ZIP (método 0 = stored, sem compressão) ----------
interface EntradaZip { nome: string; dados: Uint8Array; crc: number }

function montarZip(arquivos: { nome: string; conteudo: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const entradas: EntradaZip[] = arquivos.map((a) => {
    const dados = enc.encode(a.conteudo);
    return { nome: a.nome, dados, crc: crc32(dados) };
  });

  const locais: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  for (const e of entradas) {
    const nomeBytes = enc.encode(e.nome);
    const tam = e.dados.length;

    // cabeçalho local
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), // assinatura, versão, flags, método=0
      ...u16(0), ...u16(0),                                 // hora, data
      ...u32(e.crc), ...u32(tam), ...u32(tam),              // crc, tam comprimido, tam original
      ...u16(nomeBytes.length), ...u16(0),                  // tam nome, tam extra
    ];
    const bloco = new Uint8Array(local.length + nomeBytes.length + e.dados.length);
    bloco.set(local, 0);
    bloco.set(nomeBytes, local.length);
    bloco.set(e.dados, local.length + nomeBytes.length);
    locais.push(bloco);

    // registro central (aponta para o offset do cabeçalho local)
    const central = [
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), // assinatura, versões, flags, método
      ...u16(0), ...u16(0),                                             // hora, data
      ...u32(e.crc), ...u32(tam), ...u32(tam),                          // crc, tam comp, tam orig
      ...u16(nomeBytes.length), ...u16(0), ...u16(0),                   // nome, extra, comentário
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),                  // disco, attrs int/ext, offset local
    ];
    const blocoCentral = new Uint8Array(central.length + nomeBytes.length);
    blocoCentral.set(central, 0);
    blocoCentral.set(nomeBytes, central.length);
    centrais.push(blocoCentral);

    offset += bloco.length;
  }

  const inicioCentral = offset;
  const tamCentral = centrais.reduce((s, b) => s + b.length, 0);
  const eocd = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entradas.length), ...u16(entradas.length),
    ...u32(tamCentral), ...u32(inicioCentral), ...u16(0),
  ]);

  const total = inicioCentral + tamCentral + eocd.length;
  const saida = new Uint8Array(total);
  let p = 0;
  for (const b of locais) { saida.set(b, p); p += b.length; }
  for (const b of centrais) { saida.set(b, p); p += b.length; }
  saida.set(eocd, p);
  return saida;
}

// ---------- API pública: linhas + colunas -> bytes do .xlsx ----------
function xlsx(linhas: Dados[], colunas: string[]): Uint8Array {
  return montarZip([
    { nome: "[Content_Types].xml", conteudo: CONTENT_TYPES },
    { nome: "_rels/.rels", conteudo: RELS_RAIZ },
    { nome: "xl/workbook.xml", conteudo: WORKBOOK },
    { nome: "xl/_rels/workbook.xml.rels", conteudo: RELS_WORKBOOK },
    { nome: "xl/worksheets/sheet1.xml", conteudo: montarPlanilhaXml(linhas, colunas) },
  ]);
}
