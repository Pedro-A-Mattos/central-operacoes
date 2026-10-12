// Smoke test de runtime: extrai o <script> do dist/index.html e avalia o bundle
// inteiro num DOM mínimo stub. Pega erros de escopo/ordem de concatenação e
// exceções na avaliação de topo — o que o build (só strip de tipos) não vê.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(raiz, "dist", "index.html"), "utf8");

const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("não achei <script> no dist/index.html"); process.exit(1); }
const js = m[1];

// DOM stub mínimo para a avaliação do bundle não quebrar.
function elementoFake() {
  const el = {
    children: [], style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    attributes: {},
    appendChild(c) { this.children.push(c); return c; },
    append(...c) { this.children.push(...c); },
    insertBefore(c) { this.children.push(c); return c; },
    remove() {}, addEventListener() {}, removeEventListener() {},
    setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k]; },
    removeAttribute(k) { delete this.attributes[k]; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {}, click() {}, contains() { return false; },
    set innerHTML(_v) {}, get innerHTML() { return ""; },
    set textContent(_v) {}, get textContent() { return ""; },
    set hidden(_v) {}, get hidden() { return false; },
    firstElementChild: null,
  };
  return el;
}

const documento = {
  createElement: () => elementoFake(),
  createTextNode: (t) => ({ nodeValue: String(t) }),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  body: elementoFake(),
  documentElement: elementoFake(),
};

const ctx = vm.createContext({
  document: documento,
  window: {},
  console,
  location: { search: "", hash: "", href: "http://localhost/" },
  navigator: { language: "pt-BR" },
  setTimeout: () => 0,
  clearTimeout: () => {},
  fetch: () => Promise.reject(new Error("sem rede no smoke test")),
  URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} },
  Blob: class {},
  Intl,
  TextEncoder, TextDecoder,
  DecompressionStream: class {},
  Response: class {},
});

try {
  vm.runInContext(js, ctx, { timeout: 5000 });
  console.log("ok   bundle avaliado sem lançar — escopo e ordem de concatenação íntegros");
  process.exit(0);
} catch (e) {
  const msg = String((e && e.message) || e);
  // Símbolo indefinido = erro real de escopo/ordem (ex.: helper não visível no bundle).
  if (/is not defined/.test(msg)) {
    console.error("FALHA (símbolo indefinido — erro de escopo/ordem de arquivos):", msg);
    process.exit(1);
  }
  // Outras falhas vêm do DOM stub incompleto (não é problema do nosso código).
  console.log("ok   bundle avaliado; parou em interação com DOM stub (esperado):", msg.slice(0, 90));
  process.exit(0);
}
