// Declarações globais para o tsc. Não entram no bundle (fora de src/).

// Injetado pelo build.mjs: planilhas de exemplo em base64 (só no build --demo).
declare const EXEMPLO_EMBUTIDO: { base: { nome: string; b64: string }; atual: { nome: string; b64: string } } | null;

// Injetado pelo build.mjs: quando true (build --publico), o app roda sem nenhuma
// persistência de DADOS — tudo fica só em memória e some ao fechar a aba (só preferências de tela, como o desenho da tabela,
// ficam no navegador; ver src/06d_prefs.ts). Padrão: false.
declare const EFEMERO: boolean;
