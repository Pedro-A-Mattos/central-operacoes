// Testa a mensagem de cobrança por entregador (10d_cobranca.ts), parte pura, com o código de verdade:
// agrupamento, ordem, texto de cada aba, singular/plural, entregador ausente e que nada do destinatário vai no texto.
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
  const fmtN = String; const plural = (n, a, b) => n + " " + (n === 1 ? a : b); const fmtData = (v) => String(v);
  const normalizarBusca = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); const AJUDA = { aberta: "" };
`;
const mod = new Function(stubs + carregar("06_estado.ts") + "\n" + carregar("10c_pivot.ts") + "\n" + carregar("10d_cobranca.ts") +
  "\nreturn { gruposCobranca, textoCobranca, detalheCobranca, ABAS_COBRANCA };")();

const reg = (awb, cidade, bairro, ent, extra = {}) => ({
  dados: { "Waybill No": awb, "Consignee City": cidade, "Consignee Area": bairro, "Delivery Associate": ent, "Delivery Count": 0, "Arrival Time": "2026-10-08 09:00:00",
    "Last Problem Type": null, "Last Problem Reason": null, "Consignee Address": "Rua Segredo 123", "Consignee Contact": "João da Silva 38999990000", ...(extra.dados || {}) },
  excecoes: [], reroteada: false, entrega_confirmada: false, motivo_devolucao: null, ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== "dados")),
});
const REF = "12/10/2026 10:24";
let falhas = 0;
const ok = (c, m) => { if (!c) { console.error("FALHA:", m); falhas++; } };
const igual = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);

// 1) grupos: um por entregador, o de mais encomendas primeiro; empate pelo nome
const regs = [reg("3", "Buritis", "Centro", "Ana"), reg("1", "Unaí", "Norte", "Bia"), reg("2", "Unaí", "Centro", "Bia"), reg("4", "Unaí", "Sul", null), reg("5", "Buritis", "Centro", "Caio")];
igual(mod.gruposCobranca(regs).map((g) => [g.entregador, g.regs.length]), [["Bia", 2], ["Ana", 1], ["Caio", 1], ["(sem entregador)", 1]], "grupos por entregador");

// 2) 2 tentativas: título com a ação, lista por cidade (ordem alfabética), bairro e motivo, e fecha com o pedido e o relatório
const t2 = [
  reg("33", "Unaí", "Norte", "Bia", { dados: { "Delivery Count": 2, "Last Problem Reason": "Telefone não atendido", "Last Problem Type": "Não entregue" } }),
  reg("22", "Buritis", "Centro", "Bia", { dados: { "Delivery Count": 2, "Last Problem Reason": "Cliente ausente" } }),
  reg("11", "Unaí", "Centro", "Bia", { dados: { "Delivery Count": 2, "Last Problem Type": "Não entregue" } }),
];
const txt = mod.textoCobranca("Bia", t2, { aba: "tent2", acao: "Colocar em rota e ver devolução", referencia: REF });
const linhas = txt.split("\n");
ok(linhas[0] === "*Bia*, 3 encomendas pedem a sua atenção: colocar em rota e ver devolução.", "título: " + linhas[0]);
ok(txt.indexOf("*Buritis* (1)") < txt.indexOf("*Unaí* (2)"), "cidades em ordem alfabética");
ok(txt.indexOf("• 11 · Centro") < txt.indexOf("• 33 · Norte"), "dentro da cidade, por bairro");
ok(txt.includes("• 33 · Norte · Telefone não atendido · 2 tent."), "linha com bairro, motivo e tentativas: " + txt);
ok(txt.includes("• 11 · Centro · Não entregue · 2 tent."), "sem motivo, vale o tipo do problema");
ok(txt.includes("Me avise o retorno, por favor.") && txt.trim().endsWith("_Relatório de 12/10/2026 10:24_"), "fecha com o pedido e o horário do relatório");

// 3) singular
const um = mod.textoCobranca("Ana", [reg("9", "Unaí", "Centro", "Ana", { dados: { "Delivery Count": 1, "Last Problem Reason": "Ausente" } })], { aba: "tent1", acao: "Colocar em rota", referencia: REF });
ok(um.startsWith("*Ana*, 1 encomenda pede a sua atenção: colocar em rota."), "singular: " + um.split("\n")[0]);

// 4) aba de pendentes mostra o dia de chegada; 3 tentativas sem ausência/recusa pede confirmação
ok(mod.detalheCobranca(reg("1", "Unaí", "C", "A", { dados: { "Arrival Time": "2026-10-08 09:00:00" } }), "atrasadas") === "chegou 08/10", "pendentes: dia de chegada");
ok(mod.detalheCobranca(reg("1", "Unaí", "C", "A", { dados: { "Arrival Time": null } }), "atrasadas") === "", "sem data de chegada: nada a dizer");
ok(mod.detalheCobranca(reg("1", "Unaí", "C", "A", { dados: { "Delivery Count": 3, "Last Problem Reason": "Reprogramação" } }), "tent3") === "Reprogramação · 3 tent. · confirmar devolução", "3 tentativas sem motivo de devolução pede confirmar");
ok(mod.detalheCobranca(reg("1", "Unaí", "C", "A", { motivo_devolucao: "ausente", dados: { "Delivery Count": 3, "Last Problem Reason": "Ausente" } }), "tent3") === "Ausente · 3 tent.", "3 tentativas por ausência: sem 'confirmar'");

// 5) peça sem entregador: não é uma pessoa para cobrar
const se = mod.textoCobranca("(sem entregador)", [reg("7", "Unaí", "Centro", null)], { aba: "atrasadas", acao: "Cobrar a entrega", referencia: REF });
ok(se.startsWith("*Sem entregador atribuído*: 1 encomenda precisa de entregador.") && !se.includes("Me avise o retorno"), "sem entregador: " + se.split("\n")[0]);

// 6) nada do destinatário
const tudo = txt + um + se;
ok(!/Segredo|Rua|João|38999990000/.test(tudo), "o texto não pode levar endereço, nome nem telefone do destinatário");

// 7) só as abas em que se cobra o entregador
igual(mod.ABAS_COBRANCA, ["atrasadas", "tent1", "tent2", "tent3"], "abas com mensagem (extravio e avaria vão para a transportadora)");

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log("ok   mensagem de cobrança: agrupa por entregador, texto por aba e sem dados do destinatário");
