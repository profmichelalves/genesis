# Validação: app JS vs Script.R

O `Script.R` (referências) roda no R com limma/survival/survival::coxph e dados baixados
do cBioPortal. A PWA reimplementa o mesmo pipeline em JS. Este documento descreve como
comparar as saídas e as diferenças esperadas.

## Como comparar

1. No R, rodar `referencias/Script.R` com o estudo `all_phase2_target_2018_pub` (ou usar
   as planilhas/CSV que ele gera: `top30`, `DEA`, `cox_univariado`, `cox_multivariado`).
2. Na PWA: aba **Configurações → Exportar CSV/relatório**, ou `TALL.state` no console.
3. Conferir, em ordem de importância:
   - **Top 30 mutados** — lista e contagens devem bater exatamente (mesma fonte de mutações).
   - **DEA** — genes top por `adj.P.Val`, direção do `logFC` e conjunto DE (p<0.05) devem
     coincidir em ~95%+; os valores de `P.Value` podem diferir ligeiramente porque a
     moderação bayesiana empírica do limma (squeezeVar) é aproximada em JS.
   - **KM/log-rank** — curvas Alto/Baixo e p-valor devem bater (o produto-limite é exato).
   - **Cox univariado** — HR, IC95% e p de Wald: próximos; diferenças pequenas vêm da
     padronização do preditor (escala de 1 DP) e da estabilidade numérica do Newton–Raphson.
   - **Cox multivariado** — os genes incluídos (p<0.1 univariado) podem diferir nas bordas;
     comparar HRs dentro dos genes comuns.

## Diferenças esperadas e causas

| Item | Script.R | PWA (JS) | Impacto |
|---|---|---|---|
| Expressão | matriz RPKM baixada via cBioPortal | `molecular-data/fetch` por genes | idêntica (mesma API) |
| Transformação | sem log2 (RPKM) | toggle `log2(RPKM+1)` (padrão "Sim") | mudar para "Não" para replicar exatamente |
| Moderação DEA | `limma::squeezeVar` (exato) | trigamma por bisseção (Smyth aprox.) | p/adj.p ligeiramente diferentes |
| Empates Cox | Efron (exato) | Efron (implementação JS) | mínima |
| Escalonamento Cox | `scale()` | `z-score` com desvio amostral (ddof=1) | se o R usar ddof≠1, HRs diferem em constante |

## Valores de referência (sanidade, já validados em `test/selftest.mjs`)

- `P(|T|>1, df=10) ≈ 0.3409`; `P(|T|>2, df=10) ≈ 0.0734`.
- `χ²=3.841 (df=1) → p ≈ 0.05`; `χ²=7.815 (df=3) → p ≈ 0.05`.
- FDR BH sobre `[0.01,0.02,0.2,0.3]` → `[0.04,0.04,0.2667,0.3]`.
- Cox com fator de risco real → HR>1 significativo (teste simulado).

## Status

- [x] Motor validado em Node (`node test/selftest.mjs` — todos PASS).
- [ ] Comparação com saída real do Script.R (pendente; requer download no navegador
      e, opcionalmente, o output do R).
