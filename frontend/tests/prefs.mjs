// Testa as preferências de tela (06d_prefs.ts) com o código de verdade: o que é guardado, o que é ignorado e que o
// desenho sobrevive a uma nova importação (que zera os filtros).
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const carregar = (f) => stripTypeScriptTypes(readFileSync(join(src, f), "utf8"), { mode: "strip" });
const stubs = `
  const paraData = () => null; const diaIso = () => ""; const fmtDia = (s) => s; const fmtN = String; const plural = (n, a, b) => n + " " + (n === 1 ? a : b);
  const normalizarBusca = (s) => s; const AJUDA = { aberta: "" }; const FUNIL_ABERTO = new Map();
  const memoria = new Map(); let bloqueado = false;
  const localStorage = { getItem: (k) => { if (bloqueado) throw new Error("bloqueado"); return memoria.has(k) ? memoria.get(k) : null; },
    setItem: (k, v) => { if (bloqueado) throw new Error("bloqueado"); memoria.set(k, String(v)); }, removeItem: (k) => { memoria.delete(k); } };
`;
const mod = new Function(stubs + carregar("06_estado.ts") + "\n" + carregar("10c_pivot.ts") + "\n" + carregar("06d_prefs.ts") +
  "\nreturn { E, filtrosVazios, layoutAtual, restaurarLayout, salvarPrefs, aplicarPrefs, esquecerPrefs, memoria, FUNIL_ABERTO, travar: (b) => { bloqueado = b; } };")();
const { E, memoria } = mod;

let falhas = 0;
const ok = (c, m) => { if (!c) { console.error("FALHA:", m); falhas++; } };
const guardado = () => JSON.parse(memoria.get("cio:prefs:v1") || "null");

// 1) o que é guardado: só lista fechada
E.f.pivot.dims = ["cidade", "entregador"]; E.f.pivot.ordem = "total"; E.f.pivotEntrega.dims = ["cidade", "bairro"]; E.f.entregadores.agrupar = "cidade"; E.mapa.cor = "espera";
E.f.pivot.datasFora = ["2026-10-12"]; E.f.pivot.cel = { caminho: ["Unaí"], data: null }; E.f.pendencias.cidades = ["Buritis"];
mod.FUNIL_ABERTO.set("pendencias", true);
mod.salvarPrefs();
const g = guardado();
ok(JSON.stringify(g.pivot) === '{"dims":["cidade","entregador"],"ordem":"total"}' && g.entregadores === "cidade" && g.mapaCor === "espera" && g.funil.pendencias === true, "guarda o desenho, a cor do mapa e o funil: " + JSON.stringify(g));
ok(!/Unaí|Buritis|2026|datasFora|cel|cidades/.test(memoria.get("cio:prefs:v1")), "não guarda datas tiradas, célula escolhida nem filtros (cidades): " + memoria.get("cio:prefs:v1"));

// 2) ordem por data não vale para outro relatório
E.f.pivot.ordem = "2026-10-08"; ok(mod.layoutAtual().pivot.ordem === "nome", "ordem por data de coluna não é lembrada (volta para o nome)");

// 3) nova importação zera os filtros mas o desenho fica
E.f.pivot.ordem = "total";
const lay = mod.layoutAtual(); E.f = mod.filtrosVazios(); mod.restaurarLayout(lay);
ok(E.f.pivot.dims.join() === "cidade,entregador" && E.f.pivot.ordem === "total" && E.f.entregadores.agrupar === "cidade" && E.f.pivotEntrega.dims.join() === "cidade,bairro", "desenho sobrevive a uma nova importação");
ok(E.f.pivot.datasFora.length === 0 && E.f.pivot.cel === null && E.f.pendencias.cidades.length === 0, "mas os filtros e a seleção zeram");

// 4) próxima visita: aplica o guardado; valores ruins são ignorados
E.f = mod.filtrosVazios(); E.mapa.cor = "situacao"; mod.FUNIL_ABERTO.clear();
mod.aplicarPrefs();
ok(E.f.pivot.dims.join() === "cidade,entregador" && E.mapa.cor === "espera" && mod.FUNIL_ABERTO.get("pendencias") === true, "aplica o que estava guardado");
memoria.set("cio:prefs:v1", JSON.stringify({ pivot: { dims: ["endereco", "cidade"], ordem: "xpto" }, pivotEntrega: { dims: ["cidade", "nao-existe"] }, entregadores: 7, mapaCor: "zzz", funil: { torre: "sim", piso: false } }));
E.f = mod.filtrosVazios(); E.mapa.cor = "situacao"; mod.FUNIL_ABERTO.clear();
mod.aplicarPrefs();
ok(E.f.pivot.dims.join() === "cidade,endereco", "dims válidas entram sempre na ordem da hierarquia (cidade antes de endereço): " + E.f.pivot.dims);
ok(E.f.pivot.ordem === "nome", "ordem desconhecida é ignorada");
ok(E.f.pivotEntrega.dims.join() === "cidade", "lista com item inválido é ignorada inteira");
ok(E.f.entregadores.agrupar === "entregador" && E.mapa.cor === "situacao", "agrupamento e cor inválidos são ignorados");
ok(!mod.FUNIL_ABERTO.has("torre") && mod.FUNIL_ABERTO.get("piso") === false, "funil só aceita verdadeiro ou falso");
for (const lixo of ["{isso nao e json", "null", "[]", "42", '"texto"']) {
  memoria.set("cio:prefs:v1", lixo); E.f = mod.filtrosVazios();
  let erro = null; try { mod.aplicarPrefs(); } catch (e) { erro = e; }
  ok(!erro && E.f.pivot.dims.join() === "cidade", "armazenamento com lixo (" + lixo + ") não quebra nem muda nada");
}

// 5) navegador com armazenamento bloqueado: nada quebra
mod.travar(true);
let erroBloq = null; try { mod.salvarPrefs(); mod.aplicarPrefs(); mod.esquecerPrefs(); } catch (e) { erroBloq = e; }
ok(!erroBloq, "armazenamento bloqueado não lança erro: " + (erroBloq && erroBloq.message));
mod.travar(false);

// 6) esquecer
E.f.pivot.dims = ["cidade", "entregador"]; E.mapa.cor = "rota"; mod.salvarPrefs();
mod.esquecerPrefs();
ok(!memoria.has("cio:prefs:v1") && E.f.pivot.dims.join() === "cidade" && E.mapa.cor === "situacao" && mod.FUNIL_ABERTO.size === 0, "esquecer apaga o guardado e volta ao padrão");

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log("ok   preferências de tela: guarda só lista fechada, ignora lixo e sobrevive a nova importação");
