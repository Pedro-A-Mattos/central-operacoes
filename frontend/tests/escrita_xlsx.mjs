// Teste standalone do escritor .xlsx: gera um arquivo, grava em disco e
// confere o round-trip com o próprio LEITOR do projeto (02_xlsx.ts).
// A validação cruzada com openpyxl é feita por um script Python separado.
import { readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const src = join(raiz, "..", "src");

// Carrega leitor + escritor no mesmo escopo, removendo os tipos.
const codigo = ["01_tipos.ts", "02_xlsx.ts", "02b_xlsx_escrita.ts"]
  .map((f) => stripTypeScriptTypes(readFileSync(join(src, f), "utf8"), { mode: "strip" }))
  .join("\n");

const mod = new Function(codigo + "\nreturn { xlsx, lerPlanilhaXlsx };")();

const colunas = ["Waybill No", "Consignee City", "Observação", "Vazio"];
const linhas = [
  { "Waybill No": "SP123456789BR", "Consignee City": "São Paulo", "Observação": 'Com "aspas", vírgula & <tag>', "Vazio": null },
  { "Waybill No": "RJ000111222BR", "Consignee City": "Niterói",   "Observação": "Linha\ncom quebra", "Vazio": null },
  { "Waybill No": "0012345",       "Consignee City": "Açaí",       "Observação": "acentuação: ção, ã, ê", "Vazio": "x" },
];

const bytes = mod.xlsx(linhas, colunas);
const saida = process.env.SAIDA_XLSX || join(tmpdir(), "saida_teste.xlsx");
writeFileSync(saida, bytes);
console.log("gerado", saida + ":", bytes.length, "bytes");

// Round-trip com o leitor do próprio projeto
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const planilha = await mod.lerPlanilhaXlsx(ab);

let falhas = 0;
const checar = (cond, msg) => { if (!cond) { console.error("FALHA:", msg); falhas++; } };

checar(JSON.stringify(planilha.colunas) === JSON.stringify(colunas), "cabeçalho difere: " + JSON.stringify(planilha.colunas));
checar(planilha.linhas.length === linhas.length, `nº de linhas: esperado ${linhas.length}, obtido ${planilha.linhas.length}`);

for (let i = 0; i < linhas.length; i++) {
  for (const c of colunas) {
    const esperado = linhas[i][c] === null ? null : String(linhas[i][c]);
    const obtido = planilha.linhas[i]?.[c] ?? null;
    const obtidoNorm = obtido === null ? null : String(obtido);
    checar(esperado === obtidoNorm, `linha ${i} col "${c}": esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtidoNorm)}`);
  }
}

if (falhas) { console.error(`\n${falhas} falha(s) no round-trip`); process.exit(1); }
console.log("ok  round-trip interno (leitor do projeto releu tudo corretamente)");
