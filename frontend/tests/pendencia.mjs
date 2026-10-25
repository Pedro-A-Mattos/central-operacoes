// Testa a regra de pendência (Unaí sempre; demais cidades só se chegaram antes do dia da referência;
// tentativa no dia tira da lista) e as abas de 1 e 2 tentativas, usando o 06_estado.ts de verdade.
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const carregar = (f) => stripTypeScriptTypes(readFileSync(join(src, f), "utf8"), { mode: "strip" });
const stubs = `
  const paraData = (v) => { if (!v) return null; const d = new Date(String(v).replace(" ", "T")); return isNaN(d) ? null : d; };
  const diaIso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const fmtDia = (iso) => { const [y, m, d] = iso.split("-"); return d + "/" + m + "/" + y; };
  const fmtN = (n) => String(n); const plural = (n, a, b) => n + " " + (n === 1 ? a : b);
  const normalizarBusca = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
`;
const mod = new Function(stubs + carregar("06_estado.ts") + "\n" + carregar("10c_pivot.ts") +
  "\nreturn { E, ehPendencia, motivoPendencia, PEND, pedeAcao, pendAtivas, pendAcao, pendPrecisaAcao };")();

const REF = "2026-10-12 10:24:49";
const peca = (awb, cidade, chegada, extra = {}) => ({
  dados: { "Waybill No": awb, "Consignee City": cidade, "Arrival Time": chegada, "Delivery Count": 0, "Last Problem Date": null, ...(extra.dados || {}) },
  excecoes: [], reroteada: false, entrega_confirmada: false, backlog_dias: 1, ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== "dados")),
});
const insucesso = (n, extra = {}) => ({ excecoes: ["insucesso"], dados: { "Delivery Count": n, "Last Problem Date": "2026-10-10 11:00:00", ...(extra.dados || {}) }, ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== "dados")) });

const pecas = [
  peca("u-hoje", "Unaí", "2026-10-12 06:00:00"),
  peca("u-velha", "Unaí", "2026-10-06 06:00:00"),
  peca("u-sem-acento", "UNAI", "2026-10-12 08:00:00"),
  peca("b-hoje", "Buritis", "2026-10-12 06:00:00"),
  peca("b-ontem", "Buritis", "2026-10-11 23:50:00"),
  peca("b-sem-data", "Buritis", null),
  peca("b-confirmada", "Buritis", "2026-10-08 06:00:00", { entrega_confirmada: true }),
  peca("b-tentou-hoje", "Buritis", "2026-10-08 06:00:00", { dados: { "Delivery Count": 1, "Last Problem Date": "2026-10-12 09:00:00" } }),
  peca("u-tentou-hoje", "Unaí", "2026-10-08 06:00:00", { dados: { "Delivery Count": 2, "Last Problem Date": "2026-10-12 09:00:00" } }),
  peca("b-tentou-antes", "Buritis", "2026-10-08 06:00:00", { dados: { "Delivery Count": 1, "Last Problem Date": "2026-10-10 09:00:00" } }),
  peca("f-t1", "Formoso", "2026-10-08 06:00:00", insucesso(1)),
  peca("f-t1-rota", "Formoso", "2026-10-08 06:00:00", insucesso(1, { reroteada: true })),
  peca("f-t2-rota", "Formoso", "2026-10-08 06:00:00", insucesso(2, { reroteada: true })),
  peca("f-t2", "Formoso", "2026-10-08 06:00:00", insucesso(2)),
  peca("f-t3", "Formoso", "2026-10-08 06:00:00", insucesso(3)),
  peca("f-t1-conf", "Formoso", "2026-10-08 06:00:00", insucesso(1, { entrega_confirmada: true })),
  peca("b-hoje-t1-rota", "Buritis", "2026-10-12 05:00:00", insucesso(1, { reroteada: true })), // chegou hoje: fora do prazo; já em rota: sem ação
];
mod.E.analise = { referencia_backlog: REF, atual: pecas, justificativas: {} };
const p = Object.fromEntries(pecas.map((x) => [x.dados["Waybill No"], x]));

let falhas = 0;
const ok = (c, m) => { if (!c) { console.error("FALHA:", m); falhas++; } };
const pend = (id) => mod.ehPendencia(p[id]);

// regra de pendência
ok(pend("u-hoje"), "Unaí que chegou hoje é pendência");
ok(pend("u-velha"), "Unaí antiga é pendência");
ok(pend("u-sem-acento"), "UNAI sem acento e em maiúsculas também é Unaí");
ok(!pend("b-hoje"), "outra cidade que chegou no dia da referência não é pendência");
ok(pend("b-ontem"), "chegou ontem às 23:50: dia anterior, é pendência (dia de calendário, não 24 h)");
ok(pend("b-sem-data"), "sem data de chegada conta como pendência");
ok(!pend("b-confirmada"), "entrega confirmada não é pendência");
ok(!pend("b-tentou-hoje"), "tentativa no dia da referência tira da lista");
ok(!pend("u-tentou-hoje"), "tentativa no dia tira da lista também em Unaí");
ok(pend("b-tentou-antes"), "tentativa em outro dia não tira da lista");
ok(mod.motivoPendencia(p["b-ontem"]).motivo.includes("11/10/2026") && mod.motivoPendencia(p["b-ontem"]).motivo.includes("12/10/2026"), "o motivo cita as duas datas");
ok(mod.motivoPendencia(p["u-hoje"]).motivo.startsWith("Peça de Unaí"), "motivo de Unaí");
ok(mod.PEND.atrasadas(p["b-ontem"]) && !mod.PEND.atrasadas(p["b-hoje"]), "a aba Pendentes usa a regra");

// abas de 1 e 2 tentativas: incluem a peça que já saiu para rota de novo
const ids = (a) => mod.pendAtivas(a).map((r) => r.dados["Waybill No"]).sort();
ok(JSON.stringify(ids("tent1")) === JSON.stringify(["b-hoje-t1-rota", "f-t1", "f-t1-rota"]), "1 tentativa lista a que já está em rota: " + ids("tent1"));
ok(JSON.stringify(ids("tent2")) === JSON.stringify(["f-t2", "f-t2-rota"]), "2 tentativas lista a que já está em rota: " + ids("tent2"));
ok(!ids("tent1").includes("f-t1-conf"), "entrega confirmada não entra em 1 tentativa");
ok(!ids("tent1").includes("f-t3") && !ids("tent2").includes("f-t3"), "3 tentativas não entra em 1 nem 2");
ok(JSON.stringify(mod.pendAcao("tent1").map((r) => r.dados["Waybill No"])) === JSON.stringify(["f-t1"]), "só a que NÃO saiu conta nos alertas de 1 tentativa");
ok(JSON.stringify(mod.pendAcao("tent2").map((r) => r.dados["Waybill No"])) === JSON.stringify(["f-t2"]), "só a que NÃO saiu conta nos alertas de 2 tentativas");
ok(!mod.pendPrecisaAcao(p["b-hoje-t1-rota"]) && mod.pendPrecisaAcao(p["f-t1"]), "pede ação só a que ainda não saiu");
ok(mod.pendPrecisaAcao(p["f-t1-rota"]), "já em rota, mas pendente por prazo (chegou dia 08): continua pedindo cobrança pela lista de Pendentes");
ok(mod.pedeAcao("tent3", { reroteada: true }), "a regra de rota só vale para 1 e 2 tentativas");
ok(mod.pendAtivas("ja_em_rota").map((r) => r.dados["Waybill No"]).sort().join() === "b-hoje-t1-rota,f-t1-rota,f-t2-rota", "Já em rota segue listando as que saíram");

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log("ok   regra de pendência e abas de tentativas");
