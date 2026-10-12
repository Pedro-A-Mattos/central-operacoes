// Contrato de dados entre o motor (Python ou local) e a interface.
// Espelha backend/logistica/pipeline.py — versão 2.

type Valor = string | number | null;
type Dados = Record<string, Valor>;

type TipoErroPiso = "Entregador fora da área" | "Sem entregador" | "Cidade fora da abrangência" | "Cidade ausente";
type TipoExcecao = "devolucao" | "extravio" | "insucesso" | "revisar_tentativas";
type OrigemReferencia = "nome_arquivo" | "ultimo_evento" | "definida" | "relogio";
type Faixa = "0-1 dia" | "2-3 dias" | "4+ dias";
type Classe = "Entregue" | "Não entregue" | "Anormal";

interface ErroPiso {
  tipo: TipoErroPiso;
  detalhe: string;
  esperados: string[];
  escopo: "bairro" | "cidade";
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
  motivo_devolucao: string | null;
  status_base: Valor;
  mudou_status: boolean;
  entregador_base: Valor;
  erro_piso: ErroPiso | null;
  excecoes: TipoExcecao[];
}

interface RegSaiu {
  dados: Dados;
  categoria: "provavel_entrega" | "possivel_devolucao";
  indicio: string | null;
}

interface LinhaDesempenho {
  entregador: string; total: number; entregue: number; anormal: number; pendente: number; pct_entregue: number;
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
  removidas: { fm: string[]; descarregado: string[]; nao_recebido: string[] };
  resumo: { base_total: number; ultima_total: number; pendentes: number; saiu_entregue: number; saiu_devolucao: number; novas: number; mudou_status: number };
  ordem: { so_no_atual: number; so_na_base: number; em_ambos: number; linhas_base: number; linhas_atual: number; possivel_inversao: boolean };
  atual: RegAtual[];
  sairam: RegSaiu[];
  mudou_status: { awb: string; status_base: Valor; status_atual: Valor }[];
  fora: { base: Dados[]; atual: Dados[] };
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
  por_entregador: Record<string, number>;
  pendentes: string[];
}

interface ItemQualidade { codigo: string; titulo: string; n: number; impacto: string; exemplos: string[]; tom: "atencao" | "info" }

interface ConfigRegras { overrides: Overrides; limiar_ruido: number; cidades_ignoradas?: string[] }
interface Simulacao {
  erros_antes: number; erros_depois: number; passam_a_erro: number; deixam_de_ser_erro: number; mudam_tipo: number;
  mudancas: { awb: string; cidade: Valor; entregador: Valor; antes: string | null; depois: string | null }[];
}

interface Overrides { por_cidade: Record<string, string[]>; cidades_ignoradas: string[] }

interface ParametrosAnalise {
  ignorar_descarregado: boolean;
  ignorar_nao_recebido: boolean;
  limiar_ruido: number;
  cidades_ignoradas: string[];
  referencia_backlog?: string | null;
}
