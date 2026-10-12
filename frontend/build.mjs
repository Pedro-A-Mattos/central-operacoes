// Build sem dependências: remove anotações de tipo (node:module.stripTypeScriptTypes,
// Node >= 22.13), concatena os módulos de src/ em ordem e gera dist/index.html.
//   node build.mjs                 -> dist/index.html (servido pela API)
//   node build.mjs --demo          -> dist/demo.html  (com planilhas de exemplo embutidas)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const src = join(raiz, "src");

export function compilarJs() {
  const arquivos = readdirSync(src).filter((f) => f.endsWith(".ts")).sort();
  return arquivos.map((f) => {
    const ts = readFileSync(join(src, f), "utf8");
    return `// ---- ${f}\n` + stripTypeScriptTypes(ts, { mode: "strip" });
  }).join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const demo = process.argv.includes("--demo");
  const publico = process.argv.includes("--publico");
  const css = readFileSync(join(src, "estilos.css"), "utf8");
  let html = readFileSync(join(src, "index.html"), "utf8");
  let exemplo = "null";
  if (demo) {
    const pasta = join(raiz, "..", "backend", "dados_exemplo");
    const b64 = (n) => readFileSync(join(pasta, n)).toString("base64");
    exemplo = JSON.stringify({
      base: { nome: "tabela_base.xlsx", b64: b64("tabela_base.xlsx") },
      atual: { nome: "ultima_tabela.xlsx", b64: b64("ultima_tabela.xlsx") },
    });
  }
  const js = `"use strict";\nconst EXEMPLO_EMBUTIDO = ${exemplo};\nconst EFEMERO = ${publico ? "true" : "false"};\n(() => {\n${compilarJs()}\n})();`;
  html = html.replace("/*__CSS__*/", () => css).replace("/*__JS__*/", () => js.replace(/<\/script/gi, "<\\/script"));
  // Versão servida pela API: documento completo. Versão de demonstração (artefato):
  // só o conteúdo — a plataforma envolve com <!doctype>, <head> e <body>.
  if (!demo) html = `<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${html}\n</body>\n</html>\n`;
  mkdirSync(join(raiz, "dist"), { recursive: true });
  const saida = join(raiz, "dist", demo ? "demo.html" : "index.html");
  writeFileSync(saida, html);
  console.log("ok", saida, (html.length / 1024).toFixed(0) + " KB");
}
