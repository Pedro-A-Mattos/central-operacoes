// Testa as cidades sem prazo de chegada configuráveis (06_estado.ts de verdade): padrão Unaí, lista própria,
// lista vazia (escolha de não ter exceção), nome com acento e caixa diferentes, simulação sem salvar e texto do motivo.
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
  const fmtN = String; const plural = (n, a, b) => n + " " + (n === 1 ? a : b);
  const normalizarBusca = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); const AJUDA = { aberta: "" };
`;
const mod = new Function(stubs + carregar("06_estado.ts") + "\n" + carregar("10c_pivot.ts") +
  "\nreturn { E, ehPendencia, motivoPendencia, chavesSemPrazo, cidadesSemPrazo, nomesJuntos, CIDADES_SEM_PRAZO_PADRAO };")();
const { E } = mod;

const REF = "2026-10-12 10:24:49";
const peca = (awb, cidade, chegada) => ({ dados: { "Waybill No": awb, "Consignee City": cidade, "Arrival Time": chegada, "Delivery Count": 0, "Last Problem Date": null },
  excecoes: [], reroteada: false, entrega_confirmada: false, backlog_dias: 1 });
const hoje = "2026-10-12 06:00:00", antes = "2026-10-08 06:00:00";
const unai = peca("u", "Unaí", hoje), buritis = peca("b", "Buritis", hoje), formoso = peca("f", "Formoso", hoje), buritisAntiga = peca("ba", "Buritis", antes);
E.analise = { referencia_backlog: REF, atual: [unai, buritis, formoso, buritisAntiga], justificativas: {} };
const quais = (regs, chaves) => regs.filter((r) => (chaves ? mod.ehPendencia(r, "2026-10-12", chaves) : mod.ehPendencia(r))).map((r) => r.dados["Waybill No"]).join();

let falhas = 0;
const ok = (c, m) => { if (!c) { console.error("FALHA:", m); falhas++; } };

// 1) nunca definido: vale o padrão (Unaí) — o mesmo comportamento de antes da configuração existir
E.overrides = { por_cidade: {}, cidades_ignoradas: [] };
ok(mod.cidadesSemPrazo() === mod.CIDADES_SEM_PRAZO_PADRAO && mod.CIDADES_SEM_PRAZO_PADRAO.join() === "Unaí", "padrão é Unaí");
ok(quais(E.analise.atual) === "u,ba", "sem configuração: Unaí sempre e as demais só se chegaram antes do dia: " + quais(E.analise.atual));
E.overrides.cidades_sem_prazo = null;
ok(quais(E.analise.atual) === "u,ba", "null também significa 'nunca definido'");

// 2) lista própria
E.overrides.cidades_sem_prazo = ["Unaí", "Buritis"];
ok(quais(E.analise.atual) === "u,b,ba", "Unaí e Buritis sem prazo: as peças de hoje delas contam; Formoso de hoje não: " + quais(E.analise.atual));
E.overrides.cidades_sem_prazo = ["Formoso"];
ok(quais(E.analise.atual) === "f,ba", "só Formoso sem prazo: Unaí passa a ter prazo e a de hoje sai: " + quais(E.analise.atual));

// 3) lista vazia é uma escolha: nenhuma cidade com exceção
E.overrides.cidades_sem_prazo = [];
ok(quais(E.analise.atual) === "ba", "lista vazia: só quem chegou antes do dia da referência: " + quais(E.analise.atual));

// 4) acento e caixa não importam (o arquivo traz UNAI, unai, Unaí)
E.overrides.cidades_sem_prazo = ["unai"];
E.analise.atual.push(peca("x1", "UNAÍ", hoje), peca("x2", "Unai", hoje), peca("x3", " unaí ", hoje));
ok(quais(E.analise.atual).split(",").filter((x) => x.startsWith("x")).length === 3, "UNAÍ, Unai e ' unaí ' casam com 'unai'");

// 5) simulação sem salvar: lista hipotética passada direto; a configuração salva não muda
E.overrides.cidades_sem_prazo = ["Unaí"];
const hip = new Set(["buritis"]);
ok(quais(E.analise.atual.slice(0, 4), hip) === "b,ba" && quais(E.analise.atual.slice(0, 4)) === "u,ba", "simular outra lista não mexe na lista salva");

// 6) texto do motivo cita a cidade da própria peça
E.overrides.cidades_sem_prazo = ["Buritis"];
ok(/^Peça de Buritis: é pendência qualquer que seja a data de chegada/.test(mod.motivoPendencia(buritis).motivo), "motivo de cidade sem prazo: " + mod.motivoPendencia(buritis).motivo);
ok(/Formoso tem prazo de um dia/.test(mod.motivoPendencia(formoso).motivo), "motivo de cidade com prazo: " + mod.motivoPendencia(formoso).motivo);

// 7) a lista de nomes em português
ok(mod.nomesJuntos(["Unaí"]) === "Unaí" && mod.nomesJuntos(["Unaí", "Buritis"]) === "Unaí e Buritis" && mod.nomesJuntos(["A", "B", "C"]) === "A, B e C" && mod.nomesJuntos([]) === "", "nomesJuntos");

// 8) o cache acompanha a troca de lista (não fica preso na primeira)
E.overrides.cidades_sem_prazo = ["A"]; const c1 = mod.chavesSemPrazo(); E.overrides.cidades_sem_prazo = ["B"]; const c2 = mod.chavesSemPrazo();
ok(c1.has("a") && !c1.has("b") && c2.has("b") && !c2.has("a"), "o cache troca quando a lista é trocada");

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log("ok   cidades sem prazo configuráveis: padrão Unaí, lista própria, vazia, acento e caixa, simulação");
