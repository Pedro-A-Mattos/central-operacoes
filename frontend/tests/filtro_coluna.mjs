// Testa a lógica pura do filtro por coluna (distintosDe, passaRecorte,
// textoCanonico) extraída em 05_ui.ts. Sem DOM: só a regra de recorte.
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const src = join(dirname(dirname(fileURLToPath(import.meta.url))), "src");

// Extrai apenas os helpers puros do fim de 05_ui.ts (evita arrastar o DOM todo).
const ui = readFileSync(join(src, "05_ui.ts"), "utf8");
const inicio = ui.indexOf("const normalizarBusca");
const codigo = stripTypeScriptTypes(ui.slice(inicio), { mode: "strip" });

const ctx = vm.createContext({ console });
vm.runInContext(codigo + "\nglobalThis.api = { distintosDe, passaRecorte, textoCanonico };", ctx);
const { distintosDe, passaRecorte, textoCanonico } = ctx.api;

let falhas = 0;
const checar = (cond, msg) => { if (!cond) { console.error("FALHA:", msg); falhas++; } else console.log("ok   ", msg); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Cenário: insucessos com coluna "problema" (o exemplo do usuário)
const linhas = [
  { awb: "A1", problema: "Não entregue",  cidade: "São Paulo" },
  { awb: "A2", problema: "Endereço errado", cidade: "São Paulo" },
  { awb: "A3", problema: "Não entregue",  cidade: "Niterói" },
  { awb: "A4", problema: "Ausente",       cidade: "Niterói" },
  { awb: "A5", problema: null,            cidade: "São Paulo" },
];
const colunas = [
  { id: "problema", valor: (r) => r.problema },
  { id: "cidade", valor: (r) => r.cidade },
];

// 1. textoCanonico: null/vazio viram ""
checar(textoCanonico(null) === "" && textoCanonico("  ") === "" && textoCanonico("x") === "x", "textoCanonico normaliza vazios");

// 2. distinct da coluna problema (vazio por último)
const d = distintosDe(linhas, (r) => r.problema);
checar(eq(d, ["Ausente", "Endereço errado", "Não entregue", ""]), "distinct ordenado com vazio ao final: " + JSON.stringify(d));

// 3. filtro: esconder "Não entregue" (o pedido do usuário)
const semNaoEntregue = { problema: new Set(["Não entregue"]) };
const r3 = linhas.filter((r) => passaRecorte(r, colunas, "", semNaoEntregue));
checar(eq(r3.map((r) => r.awb), ["A2", "A4", "A5"]), "esconde 'Não entregue': " + JSON.stringify(r3.map((r) => r.awb)));

// 4. dois filtros combinam (E): esconder "Não entregue" E cidade "Niterói"
const combo = { problema: new Set(["Não entregue"]), cidade: new Set(["Niterói"]) };
const r4 = linhas.filter((r) => passaRecorte(r, colunas, "", combo));
checar(eq(r4.map((r) => r.awb), ["A2", "A5"]), "dois filtros combinam: " + JSON.stringify(r4.map((r) => r.awb)));

// 5. excluir o valor vazio esconde o nulo
const semVazio = { problema: new Set([""]) };
const r5 = linhas.filter((r) => passaRecorte(r, colunas, "", semVazio));
checar(eq(r5.map((r) => r.awb), ["A1", "A2", "A3", "A4"]), "excluir vazio esconde nulo: " + JSON.stringify(r5.map((r) => r.awb)));

// 6. busca livre combina com filtro de coluna
const r6 = linhas.filter((r) => passaRecorte(r, colunas, "niteroi", semNaoEntregue));
checar(eq(r6.map((r) => r.awb), ["A4"]), "busca + filtro: " + JSON.stringify(r6.map((r) => r.awb)));

// 7. filtro vazio (Set vazio) não esconde nada
const r7 = linhas.filter((r) => passaRecorte(r, colunas, "", { problema: new Set() }));
checar(r7.length === 5, "filtro vazio não esconde nada");

// 8. distinct de cidade
checar(eq(distintosDe(linhas, (r) => r.cidade), ["Niterói", "São Paulo"]), "distinct cidade");

if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1); }
console.log("\nTodos os testes de filtro por coluna passaram.");
