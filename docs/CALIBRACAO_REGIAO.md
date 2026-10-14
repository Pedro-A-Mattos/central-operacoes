# Calibração do critério do mapa de regiões

Como o critério de "quem atende cada região" foi escolhido. Reproduzível com
`python scripts/calibrar_criterio_regiao.py "base de estudo.xlsx"` (a planilha tem dados de clientes e fica fora do Git).

## Problema

O mapa publicado foi gerado com "vale quem tem pelo menos 100 entregas na região, mais o dominante". Nas 785 regiões
(CEPs) do estudo, só 20 têm 100 ou mais entregas; 118 têm de 20 a 99 e 647 têm menos de 20. Na prática, a regra era
"o dominante" em quase todo lugar: quem fazia a segunda maior parte de uma região era acusado de estar fora da área.

## Método (sem amostra rotulada)

Não existe uma lista de atribuições certas e erradas. Duas medidas indiretas, com semente fixa:

1. **Falso positivo (proxy).** Deriva as regras de 14/08 a 25/09 (15.725 entregas) e confere as entregas reais de
   26/09 a 10/10 (2.604). Quase todas estão certas, então a taxa de alerta mede o ruído da regra.
2. **Sensibilidade (proxy).** Nas mesmas entregas, troca o entregador por outro conhecido (sorteio) e mede quantas
   trocas o critério pega. É um **teto**: uma troca aleatória é mais fácil de detectar que um erro real entre bairros
   vizinhos.

## Resultado (suporte mínimo 20)

| Critério (entregas mínimas, participação mínima) | Alertas em entregas reais | Detecção das trocas |
|---|---|---|
| ≥ 100, sem participação (**o que estava publicado**) | **4,45%** | 97,4% |
| ≥ 50, 5% | 3,00% | 97,3% |
| ≥ 20, 5% | 2,38% | 96,9% |
| ≥ 10, 5% | 1,96% | 96,7% |
| **≥ 5, 5% (adotado)** | **1,73%** | **96,7%** |
| ≥ 3, 5% | 1,31% | 96,5% |
| ≥ 1, 5% | 1,00% | 96,3% |
| ≥ 1, sem participação | 0,54% | 91,9% |

O critério adotado reduz os alertas em entregas reais em cerca de 61% e perde 0,7 ponto de detecção. Abaixo disso a
detecção começa a cair de forma mais clara.

## Decisões do critério

- **Quem vale numa região:** pelo menos 5 entregas **e** pelo menos 5% das entregas da região. O dominante sempre vale
  (a região precisa de ao menos uma pessoa).
- **CEP e bairro somam:** vale quem atende o CEP **ou** o bairro. A cidade só entra se nenhum dos dois tem regra.
  (Um CEP genérico da sede não pode sobrepor um distrito, como Goiaminas.)
- **Chaves normalizadas:** bairro e cidade comparam sem caixa, acento e espaços duplicados. No estudo, 982 chaves de
  bairro viraram 711.
- **Suporte:** o mapa guarda quantas entregas sustentam cada regra. Região com menos de 20 entregas no histórico gera
  **"Região com pouco histórico"** (revisar), não "Entregador fora da área" (erro provável).
- **Entregador novo:** quem não aparece no histórico do mapa gera **"Entregador sem histórico"** (revisar). No arquivo
  de exemplo, dois entregadores que começaram depois de 10/10 geravam 58 dos 92 alertas de piso.
- **Ajuste manual por cidade** prevalece sobre o mapa (OP-05).

## Limites

- A troca simulada superestima a detecção real; não substitui validar com o líder do piso.
- O período do teste não tinha entregadores novos, então "sem histórico" não foi medido aqui.
- O mapa precisa ser regerado quando houver entregadores novos ou mudança de rota
  (`python scripts/gerar_mapa_regiao.py "base de estudo.xlsx"`). A tela de piso mostra de que arquivo e período ele veio.
