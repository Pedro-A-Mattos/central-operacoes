// Paridade motor local (TS) × motor Python sobre as planilhas de exemplo.
//   python3 backend/tests/gerar_referencia.py > /tmp/ref.json
//   node frontend/tests/paridade.mjs /tmp/ref.json
import { readFileSync, readdirSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(raiz, "src");
const codigo = ["01_tipos.ts", "02_xlsx.ts", "03_motor.ts"]
  .map((f) => stripTypeScriptTypes(readFileSync(join(src, f), "utf8"), { mode: "strip" })).join("\n");
const ctx = vm.createContext({ DecompressionStream, Blob, Response, TextDecoder, console });
vm.runInContext(codigo + "\nglobalThis.api = { lerPlanilhaXlsx, analisarLocal, validarTabela, desempenhoLocal, simularRegrasLocal };", ctx);
const { lerPlanilhaXlsx, analisarLocal, validarTabela, simularRegrasLocal } = ctx.api;

const ref = JSON.parse(readFileSync(process.argv[2], "utf8"));
const dados = join(raiz, "..", "backend", "dados_exemplo");
const ler = async (n) => { const b = readFileSync(join(dados, n)); return lerPlanilhaXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

let falhas = 0;
const igual = (nome, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) { falhas++; console.log("DIFERENTE", nome, "\n  local :", ja.slice(0, 400), "\n  python:", jb.slice(0, 400)); }
  else console.log("ok   ", nome);
};

for (const cenario of ref.cenarios) {
  const tb = await ler(cenario.base), tu = await ler(cenario.atual);
  const { analise: L, ctx: cl } = analisarLocal(tb, tu, cenario.parametros, cenario.overrides, {}, [cenario.base, cenario.nome_atual]);
  const P = cenario.resultado;
  const t = `[${cenario.nome}]`;
  igual(t + " referência", [L.referencia_backlog, L.referencia_origem, L.entregues_confirmadas, L.versao], [P.referencia_backlog, P.referencia_origem, P.entregues_confirmadas, P.versao]);
  igual(t + " parâmetros", L.parametros, P.parametros);
  for (const papel of ["base", "atual"]) {
    const nome = papel === "base" ? cenario.base : cenario.nome_atual;
    const v = validarTabela(papel === "base" ? tb : tu, nome); delete v.token;
    const pv = { ...cenario.validacao[papel] }; delete pv.token;
    igual(`${t} validação ${papel}`, v, pv);
  }
  igual(t + " simulação", simularRegrasLocal(cl.baseF, cl.ultF, cenario.simulacao.atual, cenario.simulacao.novo), cenario.simulacao.resultado);
  igual(t + " resumo", L.resumo, P.resumo);
  igual(t + " etapas", L.etapas, P.etapas);
  igual(t + " ordem", L.ordem, P.ordem);
  igual(t + " removidas", L.removidas, P.removidas);
  const chave = (x) => x.dados["Waybill No"];
  const porAwb = (arr) => Object.fromEntries(arr.map((x) => [chave(x), x]));
  const la = porAwb(L.atual), pa = porAwb(P.atual);
  igual(t + " AWBs atual", Object.keys(la).sort(), Object.keys(pa).sort());
  for (const campo of ["nova", "classe_operacional", "faixa_backlog", "status_base", "mudou_status", "entregador_base", "excecoes", "erro_piso", "backlog_dias", "em_rota_min", "entrega_confirmada", "motivo_devolucao", "dados"]) {
    const dif = Object.keys(pa).filter((k) => JSON.stringify(la[k]?.[campo]) !== JSON.stringify(pa[k][campo]));
    igual(`${t} atual.${campo} (${dif.length} diferenças)`, dif.slice(0, 3).map((k) => la[k]?.[campo]), dif.slice(0, 3).map((k) => pa[k][campo]));
  }
  igual(t + " sairam", L.sairam.map((x) => [chave(x), x.categoria, x.indicio]).sort(), P.sairam.map((x) => [chave(x), x.categoria, x.indicio]).sort());
  igual(t + " mudou_status", L.mudou_status, P.mudou_status);
  igual(t + " fora", [L.fora.base.length, L.fora.atual.length], [P.fora.base.length, P.fora.atual.length]);
  igual(t + " regras", L.regras, P.regras);
  igual(t + " dias", [L.dias_chegada, L.dias_chegada_entregadores], [P.dias_chegada, P.dias_chegada_entregadores]);
  const ord = (d) => [...d.linhas].sort((a, b) => (a.entregador < b.entregador ? -1 : 1));
  igual(t + " desempenho", ord(L.desempenho), ord(P.desempenho));
  const awbsOrd = (d) => Object.fromEntries(Object.entries(d.awbs).sort().map(([k, v]) => [k, Object.fromEntries(Object.entries(v).sort().map(([c, l]) => [c, [...l].sort()]))]));
  igual(t + " desempenho.awbs", awbsOrd(L.desempenho), awbsOrd(P.desempenho));
}
console.log(falhas ? `\n${falhas} diferença(s)` : "\nParidade completa.");
process.exit(falhas ? 1 : 0);
