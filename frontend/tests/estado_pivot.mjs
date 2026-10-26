// Testa o estado da tabela dinâmica entre telas, usando o 06_estado.ts de verdade:
//  1) Pendências e Pendências de entrega têm cada uma o seu estado (mexer numa não muda a outra);
//  2) um atalho vindo de outra tela (Torre, Mapa) limpa as datas tiradas e a célula escolhida da tela de destino,
//     para o número que chega ser o do clique; o desenho da tabela (dims) fica como o usuário deixou;
//  3) abrir a tela pelo menu (sem atalho) mantém o que o usuário tinha feito.
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const carregar = (f) => stripTypeScriptTypes(readFileSync(join(src, f), "utf8"), { mode: "strip" });
const stubs = `
  const paraData = () => null; const diaIso = () => ""; const fmtDia = (s) => s; const fmtN = String; const plural = (n, a, b) => n + " " + (n === 1 ? a : b);
  const normalizarBusca = (s) => s; const AJUDA = { aberta: "" };
  const history = { replaceState() {} }; const document = { getElementById: () => null }; const window = { scrollTo() {} };
`;
const mod = new Function(stubs + carregar("06_estado.ts") + "\nreturn { E, navegar, filtrosVazios };")();
const { E, navegar, filtrosVazios } = mod;

let falhas = 0;
const ok = (c, m) => { if (!c) { console.error("FALHA:", m); falhas++; } };
const marcar = (p) => { p.datasFora = ["2026-10-12"]; p.cel = { caminho: ["Unaí"], data: null }; p.dims = ["cidade", "entregador"]; p.fechados = ["Unaí"]; };
const limpo = (p) => p.datasFora.length === 0 && p.cel === null;

// 1) estados independentes
ok(E.f.pivot !== E.f.pivotEntrega, "Pendências e Pendências de entrega não podem dividir o mesmo objeto");
marcar(E.f.pivot);
ok(limpo(E.f.pivotEntrega) && E.f.pivotEntrega.dims.join() === "cidade", "mexer na tabela de Pendências não pode mudar a da aba Pendentes");
const outro = filtrosVazios();
ok(outro.pivot !== outro.pivotEntrega && outro.pivot !== E.f.pivot, "filtrosVazios devolve estados novos a cada chamada");

// 2) atalho de outra tela para Pendências: limpa o filtro, mantém o desenho
marcar(E.f.pivot); marcar(E.f.pivotEntrega);
navegar("pendencias", { de: "torre", prep: () => { E.f.pendencias = { ...filtrosVazios().pendencias, rota: ["Mais de 24 h"] }; } });
ok(limpo(E.f.pivot), "atalho da Torre para Pendências deve tirar as datas excluídas e a célula");
ok(E.f.pivot.dims.join() === "cidade,entregador" && E.f.pivot.fechados.join() === "Unaí", "o desenho da tabela (dims, linhas recolhidas) fica");
ok(E.f.pivotEntrega.datasFora.length === 1, "o atalho para Pendências não mexe na tabela da outra tela");
ok(E.f.pendencias.rota[0] === "Mais de 24 h", "o atalho continua aplicando o próprio filtro");

// atalho para Pendências de entrega: só a tabela dela
marcar(E.f.pivot); marcar(E.f.pivotEntrega);
navegar("excecoes", { de: "torre", prep: () => { E.f.excecoes = { ...filtrosVazios().excecoes, aba: "tent1" }; } });
ok(limpo(E.f.pivotEntrega), "atalho da Torre para Pendências de entrega limpa a tabela da aba Pendentes");
ok(E.f.pivot.datasFora.length === 1, "e deixa a de Pendências como estava");

// atalho do Mapa para Pendências também
marcar(E.f.pivot);
navegar("pendencias", { de: "mapa", prep: () => { E.f.pendencias = filtrosVazios().pendencias; } });
ok(limpo(E.f.pivot), "atalho do Mapa para Pendências limpa o filtro da tabela");

// atalho para outra tela não mexe em nenhuma
marcar(E.f.pivot); marcar(E.f.pivotEntrega);
navegar("piso", { de: "torre", prep: () => { E.f.piso = filtrosVazios().piso; } });
ok(E.f.pivot.datasFora.length === 1 && E.f.pivotEntrega.datasFora.length === 1, "atalho para o piso não deve limpar as tabelas");

// 3) menu (sem atalho): mantém o que o usuário fez
marcar(E.f.pivot); marcar(E.f.pivotEntrega);
navegar("pendencias"); navegar("excecoes");
ok(E.f.pivot.datasFora.length === 1 && E.f.pivot.cel !== null && E.f.pivotEntrega.datasFora.length === 1, "abrir pelo menu mantém datas tiradas e célula");

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log("ok   estado da tabela dinâmica: independente por tela e limpo nos atalhos");
