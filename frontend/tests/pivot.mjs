// Testa a conta da tabela dinâmica (10c_pivot.ts) sem DOM: soma por cidade e data, hierarquia,
// exclusão de datas, seleção de célula, idade em dias e folhas para exportação.
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const carregar = (f) => stripTypeScriptTypes(readFileSync(join(src, f), "utf8"), { mode: "strip" });
// Só o necessário do pivot: stubs mínimos para o que vem de outros módulos.
const stubs = `
  const paraData = (v) => { if (!v) return null; const d = new Date(String(v).replace(" ", "T")); return isNaN(d) ? null : d; };
  const diaIso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const entregadorDe = (d) => (d["Delivery Associate"] == null ? "(sem entregador)" : String(d["Delivery Associate"]));
  const fmtDia = (iso) => { const [y, m, d] = iso.split("-"); return d + "/" + m + "/" + y; };
  const fmtN = (n) => String(n); const plural = (n, a, b) => n + " " + (n === 1 ? a : b);
`;
const mod = new Function(stubs + carregar("10c_pivot.ts") + "\nreturn { montarPivot, diasDoRecorte, casaCelulaPivot, folhasPivot, idadeEmDias, rotuloIdade, tomIdade, rotuloCelulaPivot };")();

const reg = (cidade, ent, dia, area = "Centro", end = "Rua A") => ({ dados: { "Consignee City": cidade, "Delivery Associate": ent, "Arrival Time": dia && dia + " 10:00:00", "Consignee Area": area, "Consignee Address": end } });
const regs = [reg("Unaí", "Ana", "2026-10-16"), reg("Unaí", "Ana", "2026-10-17"), reg("Unaí", "Bia", "2026-10-17", "Norte", "Rua B"),
  reg("Buritis", "Caio", "2026-10-17"), reg("Buritis", "Caio", "2026-10-19"), reg("Buritis", null, "2026-10-19"), reg("Formoso", "Dani", null)];

let falhas = 0;
const ok = (c, m) => { if (!c) { console.error("FALHA:", m); falhas++; } };
const igual = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);

// 1) por cidade: total fecha com o recorte; datas em ordem, "sem data" por último
let t = mod.montarPivot(regs, ["cidade"]);
ok(t.raiz.total === regs.length, "total geral = nº de encomendas");
igual(t.datas, ["2026-10-16", "2026-10-17", "2026-10-19", "sem-data"], "datas");
igual(t.raiz.filhos.map((n) => [n.rotulo, n.total]), [["Buritis", 3], ["Formoso", 1], ["Unaí", 3]], "cidades em ordem alfabética");
const unai = t.raiz.filhos.find((n) => n.rotulo === "Unaí");
igual([unai.porData.get("2026-10-16"), unai.porData.get("2026-10-17"), unai.porData.get("2026-10-19") ?? 0], [1, 2, 0], "Unaí por data");
ok(t.raiz.filhos.reduce((s, n) => s + n.total, 0) === t.raiz.total, "soma das cidades = total");

// 2) cidade › entregador (sem entregador vira rótulo próprio) e folhas
t = mod.montarPivot(regs, ["cidade", "entregador"]);
const buritis = t.raiz.filhos.find((n) => n.rotulo === "Buritis");
igual(buritis.filhos.map((n) => [n.rotulo, n.total]), [["(sem entregador)", 1], ["Caio", 2]], "entregadores de Buritis");
const folhas = mod.folhasPivot(t.raiz, 2);
ok(folhas.length === 5 && folhas.reduce((s, n) => s + n.total, 0) === regs.length, "folhas somam o total");

// 3) só entregador (formato "data + entregador, sem cidade")
t = mod.montarPivot(regs, ["entregador"]);
igual(t.raiz.filhos.map((n) => n.rotulo), ["(sem entregador)", "Ana", "Bia", "Caio", "Dani"], "só entregador");

// 4) excluir datas tira da soma e da lista de colunas
t = mod.montarPivot(regs, ["cidade"], new Set(["2026-10-16", "sem-data"]));
ok(t.raiz.total === 5, "exclusão: total");
igual(t.datas, ["2026-10-17", "2026-10-19"], "exclusão: colunas");
ok(!t.raiz.filhos.some((n) => n.rotulo === "Formoso"), "cidade só com data excluída some");

// 5) dias do recorte (para as caixas de data) contam ANTES da exclusão
igual(mod.diasDoRecorte(regs), [{ dia: "2026-10-16", n: 1 }, { dia: "2026-10-17", n: 3 }, { dia: "2026-10-19", n: 2 }, { dia: "sem-data", n: 1 }], "dias do recorte");

// 6) célula selecionada devolve exatamente as encomendas da célula
const cel = { caminho: ["Buritis"], data: "2026-10-19" };
ok(regs.filter((r) => mod.casaCelulaPivot(r, cel, ["cidade"])).length === 2, "célula Buritis × 19/10");
ok(regs.filter((r) => mod.casaCelulaPivot(r, { caminho: ["Buritis"], data: null }, ["cidade"])).length === 3, "total da linha Buritis");
ok(regs.filter((r) => mod.casaCelulaPivot(r, { caminho: ["Unaí", "Ana"], data: "2026-10-17" }, ["cidade", "entregador"])).length === 1, "célula em 2 níveis");
ok(regs.filter((r) => mod.casaCelulaPivot(r, null, ["cidade"])).length === regs.length, "sem célula = tudo");
ok(mod.rotuloCelulaPivot(cel) === "Buritis · 19/10/2026", "rótulo da célula");

// 7) idade em dias de calendário (não em 24 h) e tom
ok(mod.idadeEmDias("2026-10-17", "2026-10-21") === 4, "idade 4 dias");
ok(mod.idadeEmDias("2026-10-21", "2026-10-21") === 0, "idade 0 no dia");
ok(mod.idadeEmDias("sem-data", "2026-10-21") === null, "sem data = null");
ok(mod.idadeEmDias("2026-10-22", "2026-10-21") === -1, "chegou depois da referência");
igual([mod.tomIdade(0), mod.tomIdade(1), mod.tomIdade(2), mod.tomIdade(3), mod.tomIdade(4), mod.tomIdade(null)], ["neutro", "neutro", "atencao", "atencao", "critico", "neutro"], "tons");
igual([mod.rotuloIdade(0), mod.rotuloIdade(1), mod.rotuloIdade(5), mod.rotuloIdade(null)], ["no dia", "há 1 dia", "há 5 dias", "sem data"], "rótulos de idade");

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log("ok   tabela dinâmica: soma, hierarquia, exclusão de datas, célula e idade");
