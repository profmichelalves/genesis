# Plano — PWA "TARGET ALL Explorer"

Aplicação **PWA responsiva em HTML/CSS/JS** que baixa o estudo `all_phase2_target_2018_pub`
(TARGET ALL — Leucemia Linfoide Aguda pediátrica, cBioPortal) **diretamente no navegador**
via API pública (CORS liberado) e reproduz os blocos do `referencias/Script.R`, com motor
estatístico reimplementado em JavaScript.

## 1. Arquitetura

```
Navegador (PWA) ──HTTPS──▶ cbioportal.org/api (CORS *)
      │
      ├─ IndexedDB      → cache de dados + resultados (offline/re-execução)
      ├─ Service Worker → app shell offline + instalável
      └─ Plotly.js (CDN)→ gráficos interativos (heatmap, volcano, KM, forest...)
```

- **100% client-side**: nenhum servidor. Estatística (DEA estilo-limma, KM, Cox) em JS.
- **Escopo dos dados (seletor)**:
  - **Expresso (padrão)** — painel curado ~500 genes (MSK-IMPACT468 ∪ genes mutados na
    coorte ∪ genes relevantes de ALL). Download leve (~30–40 MB), rápido, ideal para celular.
  - **Completo** — ~26 mil genes × 203 amostras, baixado em lotes de genes. **Aviso de
    tamanho**: ~1–2 GB, lento; processado em background com retomada (progresso parcial salvo).
- **Offline**: após o download, as análises re-executam sem rede.

## 2. Estrutura de arquivos

```
genesis/
  PLANO_APP.md                 # este plano
  app/
    index.html                 # shell SPA (tabs)
    manifest.webmanifest       # PWA instalável
    sw.js                      # service worker (app shell + runtime cache)
    icons/icon-192.png, icon-512.png, favicon.svg
    css/styles.css             # mobile-first, variáveis CSS, dark/light
    js/
      stats.js                 # helpers numéricos + distribuições (t, χ², normal) + FDR
      dea.js                   # t moderado estilo-limma + Benjamini–Hochberg
      survival.js              # Kaplan–Meier + log-rank + tabela de risco
      cox.js                   # Cox PH (Newton–Raphson, empates Efron, IC 95%)
      cluster.js               # agrupamento hierárquico (heatmap)
      api.js                   # cliente cBioPortal (fetch + retry + paging)
      storage.js               # camada IndexedDB (Float32Array compacto)
      datapack.js              # pipeline de download (progresso, escopo, cache)
      charts.js                # renderização Plotly (todos os gráficos)
      export.js                # PNG/SVG/CSV e relatório
      ui.js                    # tabs, formulários, toasts, tabelas
      main.js                  # bootstrap e orquestração
  test/
    selftest.mjs               # testes do motor estatístico (Node)
    compare_with_r.md          # como validar contra as saídas do Script.R
```

## 3. Dados — endpoints confirmados na API pública (validados em 2026-08-08)

| Dado | Endpoint |
|---|---|
| Metadados do estudo | `GET /api/studies/{studyId}` |
| Amostras (sample→patient) | `GET /api/studies/{studyId}/samples` (1978) |
| Listas de amostras | `GET /api/studies/{studyId}/sample-lists` → `GET /api/sample-lists/{id}/sample-ids` |
| Atributos clínicos | `GET /api/studies/{studyId}/clinical-attributes` (52) |
| Clínica por paciente | `POST /api/studies/{studyId}/clinical-data/fetch?clinicalDataType=PATIENT` — corpo `{attributeIds, ids}` (ids=patientIds; chunk ~400) |
| Mutações | `POST /api/molecular-profiles/{profile}/mutations/fetch` — corpo `{sampleIds}` (150 sequenciadas) |
| Expressão RPKM | `POST /api/molecular-profiles/{profile}/molecular-data/fetch` — corpo `{sampleIds, entrezGeneIds}` |
| Mapa gene Entrez↔Hugo | `GET /api/genes?pageSize=1000&pageNumber=N` (cache em IndexedDB) |

### Achados críticos (motivaram o desenho)

1. **`molecular-data/fetch` SEM `entrezGeneIds` ignora o filtro de amostras** e devolve
   o estudo inteiro (4,79 M linhas / 1,75 GB p/ 1 amostra pedida) — inviável e lento.
   → **Sempre informar `entrezGeneIds`** e paginar por genes (~800–1000 por request).
2. **`projection=BRIEF/SUMMARY` não reduz** o tamanho do payload de `molecular-data`.
3. **Corpos JSON** gerados com UTF-8 BOM são rejeitados (`400 "error in JSON format"`);
   no navegador `JSON.stringify` não tem esse problema (relevante só para testes locais).
4. **Clínica do estudo**: `OS_MONTHS`, `OS_STATUS` (formato `1:DECEASED`), `FIRST_EVENT`
   (Relapse=326, None=1103, Death=36, ...), `DAYS_TO_EVENT`. Auto-detecção igual ao
   `get_col()` do Script.R + fallback para seleção manual.
5. **Mutações** não trazem `hugoGeneSymbol` no nível topo — só `entrezGeneId` →
   resolver símbolo pelo mapa de genes.

## 4. Motor estatístico (JavaScript)

| Análise | Implementação | Espelha o R |
|---|---|---|
| **DEA (Relapse vs None)** | por gene: β = diferença de médias, variância agrupada, **moderação bayesiana empírica** (d0 via trigamma, fórmula de Smyth/limma), p por t com df+d0, **FDR Benjamini–Hochberg** | `logFC`, `adj.P.Val`, categorias Up/Down Alta/Moderada |
| **KM** | estimador produto-limite, dicotomia pela mediana, **log-rank** (χ²), risk table | curvas Alto/Baixo + p |
| **Cox** | MLE **Newton–Raphson** com **empates Efron**, preditores escalonados, HR + IC 95% + p (Wald); univariado e multivariado (genes p<0.1) | `cox_univariado.csv` / `cox_multivariado.csv` + forest plot |

Distribuições implementadas de forma robusta: `lgamma` (Lanczos), beta incompleta regularizada
(fracção continuada), CDF t e χ², CDF normal (erf), `trigamma`.

## 5. Telas / funcionalidades

1. **Dashboard** — cards de resumo, distribuição de `FIRST_EVENT`, status do datapack.
2. **Dados clínicos** — tabela pesquisável/filtrável + export CSV.
3. **Top 30 genes mutados** — barras horizontais + tabela com frequência relativa.
4. **Expressão diferencial** — volcano, MA plot, heatmap (com clustering hierárquico),
   thresholds ajustáveis (adj.P, |logFC|) e toggle de transformação log2.
5. **Kaplan–Meier** — painel de curvas com risk table e p-valor.
6. **Cox** — univariado (forest plot) + multivariado.
7. **Gene Explorer** — busca de gene: boxplot por grupo, status de mutação, KM individual.
8. **Configurações** — escopo de dados, colunas de sobrevida (auto ou manual), tema.
9. **Exportação** — PNG/SVG (Plotly), CSV, relatório impresso (PDF).
10. **Histórico de análises** — re-execuções com parâmetros salvos em IndexedDB.

## 6. PWA

- `manifest.webmanifest` (ícones 192/512, `display: standalone`, tema dinâmico).
- `sw.js`: cache-first do app shell + cache runtime do Plotly CDN; dados em IndexedDB.
- Mobile-first, acessível (ARIA + teclado), dark/light mode com `prefers-color-scheme`.

## 7. Etapas

1. ✅ Validação da API e definição de endpoints (seção 3).
2. ✅ Scaffold PWA (shell, manifest, SW, CSS, ícones).
3. ✅ Motor estatístico (stats → dea → survival → cox → cluster) + `test/selftest.mjs`
   (todos os testes passando em Node v22.14.0).
4. ✅ Camada de dados (api + storage + datapack) com progresso e escopos.
5. ✅ Gráficos Plotly + clustering do heatmap.
6. ✅ UI/orquestração, exportações, histórico, acessibilidade.
7. ⏳ Validação com dados reais: rodar o download no navegador (escopo Expresso) e
   comparação qualitativa com as saídas do Script.R (mesmo estudo, mesmo endpoint OS);
   ver `test/compare_with_r.md`.

## 8. Riscos e mitigações

- **Volume no modo completo** → aviso explícito, lotes de genes, armazenamento compacto
  (`Float32Array` por gene), retomada de progresso.
- **Limite de ids por request** → chunk de `ids` (clínica ~400; amostras ~40; genes ~1000).
- **Variação de colunas clínicas** → detecção automática + seleção manual.
- **Diferenças numéricas vs limma exato** → moderação estilo-limma aproxima bem; documentar
  em `test/compare_with_r.md`.

## 9. Atribuição

Dados do estudo `all_phase2_target_2018_pub` (TARGET, NCI) via cBioPortal — uso exclusivo
em pesquisa; seguir as diretrizes de publicação do TARGET. Painel Expresso baseado em
MSK-IMPACT (cBioPortal datahub, `data_gene_panel_impact468`).
