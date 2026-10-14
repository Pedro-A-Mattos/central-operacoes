// Contrato de dados entre o motor (Python ou local) e a interface.
// Espelha backend/logistica/pipeline.py — versão 2.

type Valor = string | number | null;
type Dados = Record<string, Valor>;

type TipoErroPiso = "Entregador fora da área" | "Entregador sem histórico" | "Região com pouco histórico" | "Sem entregador" | "Cidade fora da abrangência" | "Cidade ausente";
type TipoExcecao = "devolucao" | "extravio" | "insucesso" | "revisar_tentativas" | "avaria";
type OrigemReferencia = "nome_arquivo" | "ultimo_evento" | "definida" | "relogio";
type Faixa = "0-1 dia" | "2-3 dias" | "4+ dias";
type Classe = "Entregue" | "Não entregue" | "Anormal";

interface ErroPiso {
  tipo: TipoErroPiso;
  detalhe: string;
  esperados: string[];
  escopo: "bairro" | "cidade" | "cep" | "cep+bairro";
  origem_regra: string;
}

interface RegAtual {
  dados: Dados;
  nova: boolean;
  classe_operacional: Classe;
  backlog_dias: number | null;
  faixa_backlog: Faixa | null;
  em_rota_min: number | null;
  entrega_confirmada: boolean;
  reroteada: boolean;
  motivo_devolucao: string | null;
  status_base: Valor;
  mudou_status: boolean;
  entregador_base: Valor;
  erro_piso: ErroPiso | null;
  excecoes: TipoExcecao[];
}

interface RegSaiu {
  dados: Dados;
  categoria: "provavel_entrega" | "possivel_devolucao" | "ja_entregue" | "saiu_com_ocorrencia";
  indicio: string | null;
}

interface LinhaDesempenho {
  entregador: string; total: number; entregue: number; anormal: number; tratada: number; pendente: number; pct_entregue: number; ja_entregues: number;
}
interface Desempenho {
  dias: string[];
  linhas: LinhaDesempenho[];
  awbs: Record<string, Record<string, string[]>>;
}

interface Justificativa { motivo: string; observacao: string; reavaliar_em: string; criada_em: string; }

interface Analise {
  versao: number;
  motor: "python" | "local";
  id?: string;
  gerado_em: string;
  referencia_backlog: string;
  referencia_origem: OrigemReferencia;
  entregues_confirmadas: number;
  arquivos: { base: string; atual: string };
  parametros: {
    ignorar_descarregado: boolean; ignorar_nao_recebido: boolean; limiar_ruido: number; min_entregadores_urbano: number;
    limite_tentativas: number; cidades_ignoradas: string[]; motivos_devolucao: string[];
  };
  etapas: Record<string, number>;
  removidas: { fm: string[]; descarregado: string[]; nao_recebido: string[]; cruzadas: string[] };
  resumo: { base_total: number; ultima_total: number; pendentes: number; saiu_entregue: number; saiu_devolucao: number; novas: number; mudou_status: number; saiu_ja_entregue: number; saiu_com_ocorrencia: number };
  ordem: { so_no_atual: number; so_na_base: number; em_ambos: number; linhas_base: number; linhas_atual: number; possivel_inversao: boolean; evento_base: string | null; evento_atual: string | null };
  atual: RegAtual[];
  sairam: RegSaiu[];
  mudou_status: { awb: string; status_base: Valor; status_atual: Valor }[];
  fora: { base: Dados[]; atual: Dados[] };
  nao_recebido_entregue: { dados: Dados; categoria: string; confirmada: boolean }[];
  regras: {
    por_cidade: Record<string, { entregadores: string[]; origem: string; urbana: boolean }>;
    por_bairro: { cidade: string; bairro: string; entregadores: string[] }[];
    cidades_ignoradas: string[];
  };
  dias_chegada: string[];
  dias_chegada_entregadores: string[];
  desempenho: Desempenho;
  justificativas: Record<string, Justificativa>;
}

interface ProblemaArquivo { titulo: string; significado: string; acao: string }

interface ValidacaoArquivo {
  nome: string; linhas: number; colunas_total: number;
  colunas: { coluna: string; obrigatoria: boolean; presente: boolean; papel: string }[];
  problemas: ProblemaArquivo[]; avisos: string[];
  sem_awb: number; duplicadas: number; validas: number;
  chegada_min: string | null; chegada_max: string | null;
  previa: Dados[];
  token?: string | null;
  referencia_sugerida?: string | null;
  referencia_origem?: OrigemReferencia;
  qualidade?: ItemQualidade[];
}

// Resumo de uma análise guardado no histórico de importações.
interface RegistroImportacao {
  chave: string; referencia: string; referencia_origem: OrigemReferencia; gerado_em: string;
  arquivos: { base: string; atual: string };
  resumo: { pendentes: number; saiu_entregue: number; saiu_devolucao: number; novas: number };
  piso: number; excecoes: number; em_rota_24h: number;
  acoes?: number; // peças que pedem ação (Pendências de entrega); registros antigos não têm
  filtros?: { descarregado: boolean; nao_recebido: boolean }; // filtros usados: define se duas importações são comparáveis
  por_entregador: Record<string, number>;
  pendentes: string[];
}

interface ItemQualidade { codigo: string; titulo: string; n: number; impacto: string; exemplos: string[]; tom: "atencao" | "info" }

interface ConfigRegras { overrides: Overrides; limiar_ruido: number; cidades_ignoradas?: string[]; mapa_regiao?: MapaRegiao | null }
interface Simulacao {
  erros_antes: number; erros_depois: number; passam_a_erro: number; deixam_de_ser_erro: number; mudam_tipo: number;
  mudancas: { awb: string; cidade: Valor; entregador: Valor; antes: string | null; depois: string | null }[];
}

interface Overrides { por_cidade: Record<string, string[]>; cidades_ignoradas: string[] }

// Modo Estudo/Validação por região (CEP). Mapa gerado no Estudo e consumido na Validação.
// Mapa região -> entregadores. Os campos além dos conjuntos (suporte, entregadores, meta) são opcionais: mapas antigos continuam válidos.
interface MetaMapa { gerado_em: string; fonte: string; sha1?: string; periodo: { inicio: string; fim: string } | null; linhas: number; linhas_usadas: number }
interface MapaRegiao {
  limiar: number; min_participacao?: number; min_suporte?: number;
  por_cep: Record<string, string[]>; por_bairro: Record<string, string[]>; por_cidade: Record<string, string[]>;
  suporte?: { por_cep: Record<string, number>; por_bairro: Record<string, number>; por_cidade: Record<string, number> };
  entregadores?: string[]; meta?: MetaMapa; versao?: number;
}
interface ErroRegiaoReg { awb: string; dados: Dados; tipo: string; detalhe: string; esperados: string[]; escopo: string }

interface ParametrosAnalise {
  ignorar_descarregado: boolean;
  ignorar_nao_recebido: boolean;
  limiar_ruido: number;
  cidades_ignoradas: string[];
  referencia_backlog?: string | null;
  mapa_regiao?: MapaRegiao | null;
}
