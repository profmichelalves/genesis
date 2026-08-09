/* Genesis — Explicações técnicas de cada gráfico (ícone "i" → modal).
   Linguagem para médicos e cientistas de dados: descreve o método,
   os eixos, os elementos visuais e como interpretar os resultados. */
(function () {
  'use strict';
  const H = {};
  const h4 = (t) => '<h4>' + t + '</h4>';
  const li = (t) => '<li>' + t + '</li>';
  const ul = (...items) => '<ul>' + items.map(li).join('') + '</ul>';
  const b = (t) => '<b>' + t + '</b>';

  /* ---------- Dashboard: distribuição de FIRST_EVENT ---------- */
  H['first-event'] = {
    title: 'Distribuição de FIRST_EVENT',
    html:
      '<p>O campo clínico <code>FIRST_EVENT</code> registra o <b>primeiro evento relevante</b> ' +
      'após o diagnóstico de cada paciente do TARGET ALL. Nesta plataforma, as categorias ' +
      'informativas para as análises são <b>Relapse</b> (recidiva da leucemia) e <b>None</b> ' +
      '(sem evento registrado, i.e., remissão contínua até o último acompanhamento).</p>' +
      h4('Eixos') +
      ul(b('Eixo X') + ' — categorias de <code>FIRST_EVENT</code>.',
         b('Eixo Y') + ' — número de pacientes em cada categoria.') +
      h4('O que observar') +
      ul('Frequências absolutas mostram o <b>balanço da coorte</b> entre pacientes que ' +
         'recidivaram e os que permaneceram sem evento.',
         'Este campo define os grupos da análise de <b>expressão diferencial</b> (Relapse vs None).',
         'É uma estatística descritiva do desenho do estudo — não envolve teste de hipóteses.')
  };

  /* ---------- Dashboard: download do estudo ---------- */
  H['download'] = {
    title: 'Download do estudo',
    html:
      '<p>Baixa os dados públicos do estudo TARGET ALL (Leucemia Linfoide Aguda pediátrica) ' +
      'a partir do cBioPortal e os armazena no navegador (IndexedDB). Com isso, todas as ' +
      'análises rodam <b>100% localmente</b> — inclusive offline, depois do download.</p>' +
      h4('Escopos') +
      ul(b('Expresso (recomendado)') + ' — painel curado com ~500 genes relevantes para a ' +
         'doença; download rápido e suficiente para as análises da plataforma.',
         b('Completo') + ' — todos os ~26 mil genes; download pesado (centenas de MB), ' +
         'recomendado apenas quando o conjunto completo for necessário.') +
      h4('Como funciona') +
      ul('Na primeira execução, os dados são baixados e guardados em cache local.',
         'Depois de baixado, os botões passam a oferecer "Reconstruir" (atualiza o cache) e ' +
         '"Apagar dados" (remove o estudo do navegador).',
         'Após o download, os dados não saem mais da sua máquina: tudo é processado aqui.')
  };

  /* ---------- Dashboard: tabela de dados clínicos ---------- */
  H['clinical'] = {
    title: 'Tabela de dados clínicos',
    html:
      '<p>Lista dos pacientes do estudo com os atributos clínicos disponíveis no cBioPortal ' +
      'para o TARGET ALL. Colunas presentes: <code>OS_MONTHS</code> (tempo de sobrevida em ' +
      'meses), <code>OS_STATUS</code> (desfecho), <code>DAYS_TO_EVENT</code> (dias até o ' +
      'evento), <code>FIRST_EVENT</code> (primeiro evento — Relapse, None, …), ' +
      '<code>AGE_IN_DAYS</code> (idade em dias), <code>GENDER</code>, ' +
      '<code>MOLECULAR_SUBTYPE</code>, <code>ANALYSIS_COHORT</code>, ' +
      '<code>MRD_PERCENT_DAY_29</code> (doença residual mínima), <code>WBC</code> (leucócitos), ' +
      '<code>RNA_SEQ_SAMPLE</code>, <code>WES_SEQ_SAMPLE</code> e <code>AFFY_RMA_CALL</code>.</p>' +
      h4('Como usar') +
      ul('O campo <b>Filtrar (texto)</b> busca em todas as colunas ao mesmo tempo ' +
         '(ex.: <code>Relapse</code>, <code>MALE</code> ou um ID de paciente).',
         'O botão <b>Exportar CSV</b> baixa a tabela (filtrada) completa, sem o limite de exibição.',
         'A tabela mostra até <b>500 linhas</b> por vez; o contador abaixo informa o total encontrado.') +
      h4('Nota') +
      ul('Esta é a base que alimenta as análises de sobrevida (Kaplan-Meier e Cox) e a ' +
         'definição de grupos da expressão diferencial (Relapse vs None).')
  };

  /* ---------- Top 30 ---------- */
  H['top30'] = {
    title: 'Top 30 genes mais mutados',
    html:
      '<p>Barras horizontais com os <b>30 genes mais frequentemente alterados</b> por mutação ' +
      '(SNV/indel, dados de exoma — WES) na coorte. Uma amostra é contada quando apresenta ' +
      'mutação não sinônima no gene.</p>' +
      h4('Eixos') +
      ul(b('Eixo X') + ' — número de amostras com mutação no gene.',
         b('Eixo Y') + ' — gene (ordenado por frequência decrescente).') +
      h4('Interpretação') +
      ul('A frequência relativa é <code>N / total de amostras sequenciadas</code> (exibida na tabela ao lado).',
         'Genes no topo são <b>candidatos a genes motores</b> (drivers) e são reaproveitados no ' +
         'painel de Kaplan-Meier e Cox quando também expressos.',
          'Não há teste estatístico aqui — é ranking por frequência bruta.')
  };

  /* ---------- Top 30: tabela ---------- */
  H['top30-table'] = {
    title: 'Tabela — Top 30 genes mais mutados',
    html:
      '<p>Versão tabular do gráfico de barras: os <b>30 genes</b> com maior número de ' +
      'amostras mutadas, com a frequência relativa.</p>' +
      h4('Colunas') +
      ul(b('Gene') + ' — símbolo do gene.',
         b('N amostras') + ' — número de amostras WES com mutação não sinônima (SNV/indel).',
         b('Frequência (%)') + ' — N / total de amostras sequenciadas × 100.') +
      h4('Leitura') +
      ul('Genes do topo são <b>candidatos a genes motores</b> (drivers) e são reaproveitados ' +
         'no Kaplan-Meier e no Cox quando também expressos.',
         'É um ranking por frequência bruta — não envolve teste estatístico.')
  };

  /* ---------- DEA: parâmetros ---------- */
  H['dea'] = {
    title: 'Expressão diferencial — parâmetros',
    html:
      '<p>Configura e resume o teste de expressão diferencial entre pacientes com recidiva ' +
      '(<b>Relapse</b>) e sem evento (<b>None</b>). O teste segue o estilo limma: teste t com ' +
      'variância agrupada e moderação bayesiana empírica, com p-values corrigidos por ' +
      '<b>FDR de Benjamini–Hochberg</b>.</p>' +
      h4('Resumo gerado') +
      ul('Nº de amostras em cada grupo (Relapse e None), total de genes testados e quantos ' +
         'são diferencialmente expressos (DE).',
         '<code>prior df (d0)</code> — graus de liberdade do prior empírico: valor alto ' +
         'significa pouca moderação (variâncias semelhantes entre genes).',
         '<code>s0²</code> — variância do prior empírico, usada para encolher a variância ' +
         'de cada gene em direção à tendência global.') +
      h4('Botões') +
      ul(b('Rodar DEA') + ' — executa o teste completo (volcano, MA plot, heatmap e tabela).',
         b('Exportar CSV') + ' — baixa a tabela completa de resultados.')
  };

  /* ---------- Volcano ---------- */
  H['volcano'] = {
    title: 'Volcano — Expressão diferencial (Relapse vs None)',
    html:
      '<p>Cada ponto é um gene testado para <b>expressão diferencial</b> entre pacientes com ' +
      'recidiva (<b>Relapse</b>) e sem evento (<b>None</b>). O teste segue o estilo limma: ' +
      'teste t com variância agrupada e <b>moderação bayesiana empírica</b> ' +
      '(Smyth, 2004) — o df do prior (d0) é estimado por momentos e o erro padrão de cada gene ' +
      'é encolhido em direção ao prior. P-values são corrigidos por <b>FDR de Benjamini–Hochberg</b>.</p>' +
      h4('Eixos') +
      ul(b('Eixo X') + ' — <code>log2FC</code>: diferença da média de expressão (escala log2) ' +
         'entre Relapse e None. Valor positivo = gene mais expresso no grupo Relapse; ' +
         'negativo = mais expresso no grupo None.',
         b('Eixo Y') + ' — <code>-log10(adj. p)</code>: transformação do p-value ajustado; ' +
         'quanto mais alto, mais significativo (adj. p = 0.01 aparece em 2; 0.05 em ~1.3).') +
      h4('Cores') +
      ul(b('<span style="color:#d64545">Vermelho</span>') + ' — Upregulado no grupo Relapse.',
         b('<span style="color:#2d6cdf">Azul</span>') + ' — Downregulado no grupo Relapse.',
         b('<span style="color:#9aa3af">Cinza</span>') + ' — Sem diferença estatisticamente relevante (NS).') +
      h4('Limiares') +
      ul(b('DE moderado:') + ' adj. p &lt; 0.05 e |log2FC| &gt; 0.5.',
         b('DE de alta evidência:') + ' adj. p &lt; 0.01 e |log2FC| &gt; 1.0.') +
      h4('Como ler') +
      ul('Pontos <b>à esquerda</b> (log2FC &lt; 0) e <b>acima</b> do corte de significância: ' +
         'genes reprimidos nas recidivas.',
         'Pontos <b>à direita</b> e acima do corte: genes superexpressos nas recidivas.',
         'Distribuição assimétrica das caudas indica uma assinatura transcricional associada à recidiva.')
  };

  /* ---------- MA plot ---------- */
  H['ma'] = {
    title: 'MA plot — Intensidade vs razão',
    html:
      '<p>Diagnóstico padrão de análises de microarranjo/RNA-seq: relaciona a <b>magnitude da ' +
      'expressão</b> (A) à <b>magnitude da mudança</b> (M). Cada ponto é um gene, com as mesmas ' +
      'cores e significância do volcano.</p>' +
      h4('Eixos') +
      ul(b('A (média)') + ' — média de expressão do gene nas amostras Relapse e None juntas.',
         b('M (log2FC)') + ' — mudança de expressão Relapse vs None, em escala log2.') +
      h4('Interpretação') +
      ul('Sob a hipótese nula, os pontos distribuem-se <b>simetricamente em torno de M = 0</b>.',
         'Um leque que cresce em A baixo sugere <b>viés de intensidade</b> (fold-change inflado ' +
         'em genes de baixa expressão) — um aviso sobre robustez, não um resultado biológico.',
         'Um gene com |log2FC| alto e A alto é uma alteração forte e tecnicamente confiável; ' +
         '|log2FC| alto com A baixo merece verificação independente.')
  };

  /* ---------- Heatmap ---------- */
  H['heatmap'] = {
    title: 'Heatmap — Top genes diferencialmente expressos',
    html:
      '<p>Visualização conjunta da expressão dos <b>principais genes DE</b> (top 40 por adj. p) ' +
      'em todas as amostras RNA. A expressão de cada gene é convertida em <b>z-score</b> ' +
      '(desvios padrão em relação à própria média do gene), o que permite comparar padrões ' +
      'relativos entre genes de intensidades diferentes.</p>' +
      h4('Linhas e colunas') +
      ul('<b>Linhas</b> — genes DE, ordenados por <b>clusterização hierárquica</b> (genes com ' +
         'perfil de expressão semelhante ficam próximos).',
         '<b>Colunas</b> — amostras RNA, ordenadas primeiro pelo <b>grupo clínico</b> ' +
         '(Relapse, depois None, depois demais) e, dentro de cada grupo, por clusterização.') +
      h4('Cores') +
      ul(b('<span style="color:#2b4bd8">Azul</span>') + ' — expressão abaixo da média do gene (z &lt; 0).',
         '<b>Branco</b> — próxima da média (z ≈ 0).',
         b('<span style="color:#c23b3b">Vermelho</span>') + ' — acima da média (z &gt; 0).') +
      h4('Interpretação') +
      ul('Blocos verticais de cor consistente nas colunas Relapse vs None indicam <b>módulos ' +
         'gênicos coordenados</b> com a recidiva.',
         'Clusters de genes com padrão oposto (uns vermelhos onde outros azuis) sugerem ' +
         'assinaturas antagônicas — útil para gerar hipóteses, não conclusões causais.')
  };

  /* ---------- DEA: tabela de resultados ---------- */
  H['dea-table'] = {
    title: 'Tabela de resultados da DEA',
    html:
      '<p>Resultado completo do teste de expressão diferencial para todos os genes, ' +
      'ordenado por significância (adj. p).</p>' +
      h4('Colunas') +
      ul(b('Gene') + ' — símbolo do gene.',
         b('logFC') + ' — diferença de expressão em escala log2 (positivo = mais expresso ' +
         'no grupo Relapse).',
         b('AveExpr') + ' — expressão média do gene nas amostras analisadas.',
         b('t') + ' — estatística t do teste moderado.',
         b('P.Value') + ' — p-value bruto.',
         b('adj.P.Val') + ' — p-value ajustado (FDR de Benjamini–Hochberg).',
         b('Classificação') + ' — Upregulado / Downregulado / NS conforme os limiares ' +
         '(adj. p &lt; 0.05 e |log2FC| &gt; 0.5).') +
      h4('Leitura') +
      ul('Ordene por adj.P.Val para os achados mais robustos.',
         'A tabela exibe até 200 linhas; o CSV exporta o conjunto completo.')
  };

  /* ---------- Kaplan-Meier ---------- */
  H['km'] = {
    title: 'Kaplan-Meier — Sobrevida por expressão do gene',
    html:
      '<p>Curvas de sobrevida pelo <b>estimador produto-limite de Kaplan-Meier</b> para os grupos ' +
      '<b>Alto</b> e <b>Baixo</b> expressão do gene (dicotomização pela <b>mediana</b> das amostras ' +
      'com sobrevida e expressão válidas). Endpoint: sobrevida global (OS) ou livre de doença ' +
      '(DFS), conforme o estudo.</p>' +
      h4('Elementos da curva') +
      ul('<b>Degraus</b> — momentos em que ocorrem eventos (óbitos/recidivas).',
         '<b>Tiques transversais</b> — <b>censuras</b>: pacientes retirados do seguimento sem ' +
         'evento (perdas ou fim do acompanhamento). A curva cai apenas em eventos reais.',
         '<b>Faixa colorida</b> — intervalo de confiança de 95% da sobrevida, construído na ' +
         'transformação <b>log-log</b> (conf.type = "log" do <code>survfit</code>), restrito a [0,1].') +
      h4('Tabela de risco') +
      ul('Mostra o <b>n em risco</b> (pacientes ainda em acompanhamento) em tempos fixos ' +
         '(0, 12, 24… meses). Conforme o n cai, as curvas tornam-se menos confiáveis — ' +
         'a tabela contextualiza as caudas das curvas.') +
      h4('Teste log-rank') +
      ul('O <b>p</b> anotado vem do teste log-rank (estatística χ², 1 grau de liberdade para ' +
         'dois grupos), que compara as curvas ao longo de todo o seguimento: a hipótese nula é a ' +
         'ausência de diferença entre os grupos.') +
      h4('Cautelas') +
      ul('A dicotomização pela mediana é uma <b>simplificação</b> — perde a informação da ' +
         'relação contínua gene-sobrevida.',
         'Com muitos genes testados, o p nominal <b>não é ajustado para múltiplas ' +
         'comparações</b> — p &lt; 0.05 deve ser encarado como evidência exploratória.')
  };

  /* ---------- Cox: parâmetros ---------- */
  H['cox'] = {
    title: 'Regressão de Cox — parâmetros',
    html:
      '<p>Configura a análise de sobrevivência pela <b>regressão de Cox</b> de riscos ' +
      'proporcionais do tempo até o evento (OS — sobrevida global, ou DFS — livre de ' +
      'doença). A expressão de cada gene é <b>padronizada</b> (z-score), portanto o hazard ' +
      'ratio descreve o efeito de um aumento de <b>1 desvio padrão</b>.</p>' +
      h4('Entrada') +
      ul('Genes separados por vírgula. Com o campo vazio, a análise se adapta ao escopo baixado: ' +
         'no <b>Expresso</b>, roda todos os genes do painel baixado; no <b>Completo</b>, os ' +
         'candidatos top (top 10 DEGs e top 30 mutados com expressão), como no Script.R. ' +
         'O forest exibe até 120 genes mais significativos.') +
      h4('Resultado') +
      ul('São gerados o <b>forest plot</b> e as tabelas <b>univariada</b> e ' +
         '<b>multivariada</b>.',
         'Na tabela univariada, genes com p &lt; 0.05 são marcados com <b>*</b>.',
         b('Exportar CSV') + ' — baixa os resultados univariados.')
  };

  /* ---------- Forest plot (Cox) ---------- */
  H['forest'] = {
    title: 'Forest plot — Cox univariado',
    html:
      '<p><b>Regressão de Cox de riscos proporcionais</b> univariada (1 gene por modelo) do tempo ' +
      'até o evento. A expressão do gene é <b>padronizada</b> (z-score) nas amostras do modelo, e o ' +
      'coeficiente é estimado por máxima verossimilhança via Newton–Raphson com aproximação de ' +
      '<b>Efron</b> para empates.</p>' +
      h4('Leitura') +
      ul('Cada ponto é o <b>hazard ratio (HR)</b> = exp(β): o efeito de um aumento de ' +
         '<b>1 desvio padrão</b> na expressão do gene sobre o risco instantâneo do evento.',
         '<b>HR &gt; 1</b> — maior expressão associa-se a maior risco (pior prognóstico).',
         '<b>HR &lt; 1</b> — maior expressão associa-se a menor risco (proteção).',
         '<b>Barras</b> — intervalo de confiança de 95% de Wald (exp(β ± 1.96·se)).',
         '<b>Linha tracejada em HR = 1</b> — ponto de efeito nulo; genes cujo IC cruza a ' +
         'linha não têm evidência de associação.') +
      h4('Cores') +
      ul(b('<span style="color:#c0392b">Vermelho</span>') + ' — HR &gt; 1: maior expressão associa-se a ' +
         'maior risco (pior prognóstico).',
         b('<span style="color:#2980b9">Azul</span>') + ' — HR ≤ 1: maior expressão associa-se a menor ' +
         'risco (proteção).') +
      h4('Cautelas') +
      ul('Modelo <b>univariado</b> — não ajusta para covariáveis; associações podem refletir ' +
         'confundimento.',
         'Assume-se <b>proporcionalidade dos riscos</b> (efeito constante no tempo).',
          'Múltiplos genes testados — aplicar correção para comparações múltiplas antes de ' +
          'conclusões.')
  };

  /* ---------- Cox multivariado (tabela) ---------- */
  H['cox-multi'] = {
    title: 'Cox multivariado',
    html:
      '<p>Modelo de Cox com <b>várias covariáveis (genes) ajustadas simultaneamente</b>, ' +
      'estimando o efeito de cada gene controlado pelos demais. A expressão é padronizada ' +
      '(z-score): o HR refere-se a um aumento de 1 desvio padrão.</p>' +
      h4('Seleção de variáveis') +
      ul('Entram os genes com <b>p &lt; 0.1</b> no Cox univariado, limitados a ' +
         '<b>10 covariáveis</b> para estabilidade numérica.') +
      h4('Colunas') +
      ul(b('Covariável') + ' — gene incluído no modelo.',
         b('HR') + ' — hazard ratio ajustado pelas demais covariáveis.',
         b('IC95%') + ' — intervalo de confiança de 95% de Wald.',
         b('p') + ' — p-value do coeficiente.') +
      h4('Cautelas') +
      ul('O ajuste simultâneo reduz confundimento, mas o número de eventos limita quantas ' +
         'covariáveis são estimadas de forma confiável.',
         'Compare com o univariado: genes significativos nos dois modelos são os achados ' +
         'mais consistentes.')
  };

  window.TALL = window.TALL || {};
  window.TALL.help = H;
  if (window.TALL.ui) window.TALL.ui.setHelp(H);
})();
