# Dados: TARGET ALL — cBioPortal (RNA-seq in silico)
# Objetivos:
#   1. Top 30 genes mais mutados/alterados
#   2. Análise de Expressão Diferencial (DEA) — Relapse vs None
#   3. Curvas de Kaplan-Meier
#   4. Tempo de Sobrevida (Cox univariado + multivariado)

# BLOCO 0 — INSTALAÇÃO E CARREGAMENTO DE PACOTES
# ##############################################################################

if (!requireNamespace("BiocManager", quietly = TRUE))
  install.packages("BiocManager")

bioc_pkgs <- c(
  "cBioPortalData",       # Acesso ao cBioPortal
  "limma",                # Expressão diferencial
  "MultiAssayExperiment", # Estrutura MultiAssayExperiment
  "SummarizedExperiment", # Estrutura de experimentos
  "RaggedExperiment",     # Estrutura de mutações
  "GenomicRanges",        # Manipulação de ranges genômicos
  "org.Hs.eg.db"          # Anotação de genes humanos (Entrez -> Hugo)
)

cran_pkgs <- c(
  "tidyverse",    # Manipulação de dados
  "ggplot2",      # Gráficos
  "ggrepel",      # Labels sem sobreposição
  "pheatmap",     # Heatmaps
  "RColorBrewer", # Paletas de cores
  "survival",     # Kaplan-Meier e Cox
  "survminer",    # Visualização de sobrevida
  "pROC",         # AUC / ROC
  "glmnet",       # Regressão regularizada (modelo combinado)
  "future",       # Dependência de pacotes paralelos (survminer etc.)
  "patchwork",    # Combinar gráficos
  "scales"        # Formatação de eixos
)

install_if_missing <- function(pkgs, bioc = FALSE) {
  miss <- pkgs[!pkgs %in% installed.packages()[, "Package"]]
  if (length(miss) > 0) {
    message("Instalando: ", paste(miss, collapse = ", "))
    if (bioc) BiocManager::install(miss, ask = FALSE, update = FALSE)
    else install.packages(miss, quiet = TRUE)
  }
}

# 'future' é dependência silenciosa de vários pacotes (survminer, glmnet);
# instalar primeiro evita falhas de carregamento mais adiante
if (!"future" %in% installed.packages()[, "Package"])
  install.packages("future", quiet = TRUE)

install_if_missing(cran_pkgs, bioc = FALSE)
install_if_missing(bioc_pkgs, bioc = TRUE)

carregar_pkg <- function(pkg) {
  tryCatch({
    suppressPackageStartupMessages(library(pkg, character.only = TRUE))
  }, error = function(e) {
    message("AVISO: falha ao carregar '", pkg, "' — ", e$message)
  })
}

pkgs_carregar <- c(
  "cBioPortalData", "MultiAssayExperiment", "SummarizedExperiment",
  "RaggedExperiment", "GenomicRanges", "org.Hs.eg.db",
  "limma", "tidyverse", "ggplot2", "ggrepel", "pheatmap",
  "RColorBrewer", "survival", "survminer", "pROC", "glmnet",
  "patchwork", "scales", "future"
)
invisible(lapply(pkgs_carregar, carregar_pkg))

# IMPORTANTE: org.Hs.eg.db (via AnnotationDbi) mascara dplyr::select.
# Fixar explicitamente para evitar erros silenciosos em todo o pipeline.
select <- dplyr::select

# Seed global — garante reprodutibilidade das etapas estocásticas
# (cv.glmnet no Bloco 5). O set.seed(42) pontual no Bloco 5 é redundante
# com esta linha, mantido por clareza.
set.seed(42)

# Diretório de saída
dir.create("resultados_TARGET_ALL", showWarnings = FALSE)
out <- "resultados_TARGET_ALL/"
message("Resultados serão salvos em: ", normalizePath(out))


# ##############################################################################
# BLOCO 1 — CONEXÃO E DOWNLOAD DO ESTUDO
# ##############################################################################

message("\n", strrep("=", 65))
message("  BLOCO 1 — Carregamento dos Dados (TARGET ALL)")
message(strrep("=", 65))

# O aviso "linha final incompleta... api.json" ao criar o cBioPortal()
# é cosmético (arquivo de cache sem newline final) e pode ser ignorado
cbio <- cBioPortal()

all_studies <- getStudies(cbio)
target_all  <- all_studies %>%
  filter(
    str_detect(studyId, regex("all_|target", ignore_case = TRUE)) |
    str_detect(name,    regex("lymphoblastic|leukemia.*ALL|ALL.*leukemia",
                               ignore_case = TRUE))
  ) %>%
  dplyr::select(studyId, name, allSampleCount)

message("Estudos ALL encontrados:")
print(target_all)

study_id <- "all_phase2_target_2018_pub"
if (!study_id %in% all_studies$studyId) {
  study_id <- target_all$studyId[1]
  message("ID ajustado para: ", study_id)
}
message("Estudo selecionado: ", study_id)

message("Baixando dados...")
mae <- cBioDataPack(study_id, ask = FALSE)

message("\nExperimentos disponíveis:")
print(names(experiments(mae)))

# Experimentos esperados neste estudo:
#   mutations (RaggedExperiment) | mrna_seq_rpkm (SummarizedExperiment, Entrez ID)
#   cna, methylation_hm27, mirna, mrna_agilent_microarray, etc.


# ##############################################################################
# BLOCO 2 — DADOS CLÍNICOS
# ##############################################################################

message("\n", strrep("=", 65))
message("  BLOCO 2 — Dados Clínicos")
message(strrep("=", 65))

clinical_raw <- as.data.frame(colData(mae))
message("Variáveis clínicas (", ncol(clinical_raw), " colunas):")
print(names(clinical_raw))

na_strings <- c("NA", "[Not Available]", "[Not Applicable]",
                 "[Unknown]", "", "N/A", "unknown")

get_col <- function(df, candidates) {
  found <- intersect(candidates, names(df))
  if (length(found) > 0) found[1] else NULL
}

clinical <- clinical_raw %>%
  mutate(across(where(is.character), ~ifelse(. %in% na_strings, NA, .)))

os_time_col   <- get_col(clinical, c("OS_MONTHS", "OS_DAYS",
                                      "OVERALL_SURVIVAL_MONTHS", "os_months"))
os_event_col  <- get_col(clinical, c("OS_STATUS", "VITAL_STATUS",
                                      "DECEASED", "os_status"))
dfs_time_col  <- get_col(clinical, c("DFS_MONTHS", "EFS_MONTHS",
                                      "EVENT_FREE_SURVIVAL_MONTHS", "dfs_months"))
dfs_event_col <- get_col(clinical, c("DFS_STATUS", "EFS_STATUS",
                                      "EVENT_FREE_SURVIVAL_STATUS", "dfs_status"))

message("\nColunas de sobrevida identificadas:")
message("  OS tempo : ", os_time_col   %||% "NÃO ENCONTRADA")
message("  OS evento: ", os_event_col  %||% "NÃO ENCONTRADA")
message("  DFS tempo: ", dfs_time_col  %||% "NÃO ENCONTRADA")
message("  DFS evento:", dfs_event_col %||% "NÃO ENCONTRADA")

if (!is.null(os_time_col) && !is.null(os_event_col)) {
  clinical$surv_time  <- suppressWarnings(as.numeric(clinical[[os_time_col]]))
  clinical$surv_event <- ifelse(
    str_detect(toupper(as.character(clinical[[os_event_col]])),
               "DECEASED|DEAD|1|DIED"), 1L, 0L)
  surv_type <- "OS (Sobrevida Global)"
} else if (!is.null(dfs_time_col) && !is.null(dfs_event_col)) {
  clinical$surv_time  <- suppressWarnings(as.numeric(clinical[[dfs_time_col]]))
  clinical$surv_event <- ifelse(
    str_detect(toupper(as.character(clinical[[dfs_event_col]])),
               "RECURRED|EVENT|1|RELAPSE"), 1L, 0L)
  surv_type <- "DFS (Sobrevida Livre de Doença)"
} else {
  stop("ERRO: Colunas de sobrevida não encontradas.")
}

message("Endpoint de sobrevida: ", surv_type)
message("Eventos: ", sum(clinical$surv_event, na.rm = TRUE),
        " / ", sum(!is.na(clinical$surv_event)))

write.csv(clinical, paste0(out, "clinical_data.csv"), row.names = FALSE)
message("clinical_data.csv salvo.")


# ##############################################################################
# BLOCO 3 — TOP 30 GENES MAIS MUTADOS / ALTERADOS
# ##############################################################################

message("\n", strrep("=", 65))
message("  BLOCO 3 — Top 30 Genes Mais Mutados/Alterados")
message(strrep("=", 65))

exp_names <- names(experiments(mae))
mut_idx   <- which(str_detect(tolower(exp_names), "mutation|mut|maf|snp|variant"))
top30_genes <- NULL
mut_assay   <- NULL

if (length(mut_idx) > 0) {

  mut_exp <- experiments(mae)[[mut_idx[1]]]
  message("Experimento de mutação: ", exp_names[mut_idx[1]])
  message("Classe: ", class(mut_exp), " | Dimensões: ",
          nrow(mut_exp), " x ", ncol(mut_exp))

  # sparseAssay() é o método correto para extrair dados de um
  # RaggedExperiment de mutações: retorna matriz gene x amostra onde
  # NA = mutação ausente, valor numérico = mutação presente.
  # Tentativas de as.data.frame(rowRanges(x)) falham com erro de
  # "row.names duplicados" pois múltiplos genes se repetem nas linhas.
  mut_assay   <- sparseAssay(mut_exp)
  mut_binaria <- (!is.na(mut_assay)) * 1L
  genes_vec   <- rownames(mut_binaria)

  top30_genes <- data.frame(
    Gene       = genes_vec,
    n_amostras = rowSums(mut_binaria, na.rm = TRUE)
  ) %>%
    group_by(Gene) %>%
    summarise(n_amostras = sum(n_amostras), .groups = "drop") %>%
    mutate(freq_relativa = round(100 * n_amostras / ncol(mut_binaria), 1)) %>%
    arrange(desc(n_amostras)) %>%
    head(30)

  message("Top 30 genes mais mutados:")
  print(top30_genes)
  write.csv(top30_genes, paste0(out, "top30_genes_mutados.csv"), row.names = FALSE)
  message("top30_genes_mutados.csv salvo.")

} else {
  message("Mutações não encontradas no pacote. Buscando via API...")
  mol_profiles <- getMolecularProfiles(cbio, studyId = study_id)
  mut_prof_id  <- mol_profiles %>%
    filter(molecularAlterationType == "MUTATION_EXTENDED") %>%
    pull(molecularProfileId)

  if (length(mut_prof_id) > 0) {
    all_samp <- getSamples(cbio, studyId = study_id)
    mut_api  <- getMutationsInMolecularProfile(
      api                = cbio,
      molecularProfileId = mut_prof_id[1],
      sampleIds          = all_samp$sampleId
    )
    top30_genes <- mut_api %>%
      group_by(hugoGeneSymbol) %>%
      summarise(
        n_amostras    = n_distinct(sampleId),
        freq_relativa = round(100 * n_distinct(sampleId) /
                                n_distinct(mut_api$sampleId), 1),
        .groups = "drop"
      ) %>%
      rename(Gene = hugoGeneSymbol) %>%
      arrange(desc(n_amostras)) %>%
      head(30)
    write.csv(top30_genes, paste0(out, "top30_genes_mutados.csv"), row.names = FALSE)
  }
}

# Gráfico Top 30
if (!is.null(top30_genes) && nrow(top30_genes) > 0) {
  n_amostras_mut <- if (!is.null(mut_assay)) ncol(mut_assay) else "?"

  p_top30 <- top30_genes %>%
    arrange(freq_relativa) %>%
    mutate(Gene = factor(Gene, levels = Gene)) %>%
    ggplot(aes(x = Gene, y = freq_relativa, fill = freq_relativa)) +
    geom_col(color = "gray20", linewidth = 0.3) +
    geom_text(aes(label = paste0(freq_relativa, "%")),
              hjust = -0.1, size = 3.2, color = "gray20") +
    coord_flip() +
    scale_fill_gradient(low = "#fef0d9", high = "#d7301f", name = "Freq. (%)") +
    scale_y_continuous(expand = expansion(mult = c(0, 0.15))) +
    labs(
      title    = "Top 30 Genes Mais Mutados/Alterados",
      subtitle = paste0("Leucemia Linfoide Aguda — TARGET ALL (n=",
                         n_amostras_mut, " amostras)"),
      x = NULL, y = "Frequência de Mutação (%)"
    ) +
    theme_classic(base_size = 12) +
    theme(
      plot.title      = element_text(face = "bold", size = 14),
      plot.subtitle   = element_text(color = "gray50", size = 10),
      axis.text.y     = element_text(size = 9),
      legend.position = "right"
    )

  ggsave(paste0(out, "fig1_top30_genes.png"), p_top30,
         width = 10, height = 10, dpi = 300, bg = "white")
  print(p_top30)
  message("fig1_top30_genes.png salvo.")
}


# ##############################################################################
# BLOCO 4 — EXPRESSÃO DIFERENCIAL (DEA): Relapse vs None
# ##############################################################################

message("\n", strrep("=", 65))
message("  BLOCO 4 — Expressão Diferencial (limma) — Relapse vs None")
message(strrep("=", 65))

# ---- Carregar e limpar matriz de expressão ----
rna_exp_name <- "mrna_seq_rpkm"
if (!rna_exp_name %in% exp_names) {
  rna_idx <- which(str_detect(tolower(exp_names), "rna_seq|rnaseq|rpkm|tpm|fpkm"))
  if (length(rna_idx) == 0)
    stop("ERRO: Experimento RNA-seq não encontrado. Disponíveis: ",
         paste(exp_names, collapse = ", "))
  rna_exp_name <- exp_names[rna_idx[1]]
}

message("Usando experimento: ", rna_exp_name)
rna_exp     <- experiments(mae)[[rna_exp_name]]
expr_matrix <- assay(rna_exp)
message("Dimensões brutas: ", nrow(expr_matrix), " x ", ncol(expr_matrix))

expr_matrix <- expr_matrix[
  rowSums(!is.na(expr_matrix)) >= ncol(expr_matrix) * 0.7, ]
expr_matrix <- expr_matrix[
  apply(expr_matrix, 1, var, na.rm = TRUE) > 0, ]
expr_matrix <- t(apply(expr_matrix, 1, function(x) {
  x[is.na(x)] <- median(x, na.rm = TRUE); x
}))
message("Após filtragem: ", nrow(expr_matrix), " genes x ", ncol(expr_matrix), " amostras")

# ---- Converter Entrez ID -> símbolo Hugo ----
# NOTA: neste estudo (mrna_seq_rpkm) os rownames são Entrez IDs numéricos
# ("7105", "64102" etc.), ao contrário de outros estudos do cBioPortal
# (ex.: CRC mrna_seq_v2_rsem) cujos símbolos Hugo já vêm nativos.
entrez_ids <- rownames(expr_matrix)
mapa_genes <- AnnotationDbi::select(
  org.Hs.eg.db,
  keys    = entrez_ids,
  columns = c("ENTREZID", "SYMBOL"),
  keytype = "ENTREZID"
)

mapa_clean <- mapa_genes %>%
  filter(!is.na(SYMBOL)) %>%
  distinct(ENTREZID, .keep_all = TRUE)

genes_com_simbolo <- rownames(expr_matrix) %in% mapa_clean$ENTREZID
expr_matrix_sym   <- expr_matrix[genes_com_simbolo, ]
idx <- match(rownames(expr_matrix_sym), mapa_clean$ENTREZID)
rownames(expr_matrix_sym) <- mapa_clean$SYMBOL[idx]

gene_var        <- apply(expr_matrix_sym, 1, var, na.rm = TRUE)
expr_matrix_sym <- expr_matrix_sym[order(-gene_var), ]
expr_matrix_sym <- expr_matrix_sym[!duplicated(rownames(expr_matrix_sym)), ]

message("Matriz com símbolos: ", nrow(expr_matrix_sym), " genes x ",
        ncol(expr_matrix_sym), " amostras")

# ---- Converter clínico (remover colunas Rle) ----
# colData() pode trazer colunas em formatos atípicos (Rle, DataFrame
# aninhado) que quebram operações do dplyr (ex.: erro "Rle of type
# 'list' is not supported" em group_by/slice). Esta conversão "achata"
# tudo para tipos R nativos antes de prosseguir.
clinical_plain <- do.call(data.frame, lapply(names(clinical), function(col) {
  x <- clinical[[col]]
  if (is(x, "Rle"))       x <- as.vector(x)
  if (is.list(x))         x <- sapply(x, function(i) paste(i, collapse = ";"))
  if (is(x, "DataFrame")) x <- as.character(x[[1]])
  x
}))
names(clinical_plain) <- names(clinical)
clinical_plain$patient_id <- str_remove(rownames(clinical), "\\.\\d+$")

# Deduplicação por paciente usando base R (evita problemas de tipo
# que dplyr::group_by/slice apresentam com colunas heterogêneas)
clinical_plain$..row.. <- seq_len(nrow(clinical_plain))
primeira_ocorrencia    <- tapply(clinical_plain$..row..,
                                  clinical_plain$patient_id, min)
clinical_dedup         <- clinical_plain[primeira_ocorrencia, ]
clinical_dedup$..row.. <- NULL
rownames(clinical_dedup) <- clinical_dedup$patient_id

message("Pacientes únicos: ", nrow(clinical_dedup))

# ---- Alinhar expressão (nível amostra) com clínico (nível paciente) ----
# Os IDs de amostra (ex.: TARGET-10-PAKSWW-03) incluem um sufixo de tipo
# de amostra que não existe no ID de paciente do clínico
# (ex.: TARGET-10-PAKSWW) — remover o sufixo "-NN" antes do join.
expr_sample_map <- data.frame(
  sample_id  = colnames(expr_matrix_sym),
  patient_id = str_remove(colnames(expr_matrix_sym), "-\\d+$"),
  stringsAsFactors = FALSE
) %>% filter(patient_id %in% rownames(clinical_dedup))

expr_sub <- expr_matrix_sym[, expr_sample_map$sample_id]
clin_sub <- clinical_dedup[expr_sample_map$patient_id, ]
rownames(clin_sub) <- expr_sample_map$sample_id

message("Amostras alinhadas: ", ncol(expr_sub))
message("Alinhamento OK: ", all(colnames(expr_sub) == rownames(clin_sub)))

# ---- Agrupamento: Relapse vs None (FIRST_EVENT) ----
message("\nDistribuição de FIRST_EVENT:")
print(table(clin_sub$FIRST_EVENT, useNA = "ifany"))

keep_dea  <- clin_sub$FIRST_EVENT %in% c("Relapse", "None")
expr_dea  <- expr_sub[, keep_dea]
groups    <- factor(clin_sub$FIRST_EVENT[keep_dea],
                    levels = c("None", "Relapse"))
dea_label <- "Relapse vs None (FIRST_EVENT)"

message("DEA: ", dea_label)
message("Grupos: None=", sum(groups == "None"),
        " | Relapse=", sum(groups == "Relapse"))

# ---- limma ----
design   <- model.matrix(~0 + groups)
colnames(design) <- levels(groups)
contrast <- makeContrasts(Relapse - None, levels = design)

fit  <- lmFit(expr_dea, design)
fit2 <- contrasts.fit(fit, contrast)
fit2 <- eBayes(fit2)

de_results <- topTable(fit2, coef = 1, number = Inf, sort.by = "P") %>%
  rownames_to_column("gene") %>%
  mutate(
    signif = case_when(
      adj.P.Val < 0.01 & logFC >  1.0 ~ "Up — Alta",
      adj.P.Val < 0.01 & logFC < -1.0 ~ "Down — Alta",
      adj.P.Val < 0.05 & logFC >  0.5 ~ "Up — Moderada",
      adj.P.Val < 0.05 & logFC < -0.5 ~ "Down — Moderada",
      TRUE ~ "NS"
    ),
    color_grp = case_when(
      str_detect(signif, "Up")   ~ "Upregulado",
      str_detect(signif, "Down") ~ "Downregulado",
      TRUE ~ "NS"
    )
  )

message("Genes DEG (adj.P<0.05): ", sum(de_results$signif != "NS"))
message("Top 15 DEGs:")
print(head(de_results[, c("gene", "logFC", "adj.P.Val", "signif")], 15))
write.csv(de_results, paste0(out, "DEA_results_relapse_vs_none.csv"), row.names = FALSE)
message("DEA_results_relapse_vs_none.csv salvo.")

# ---- Volcano Plot ----
top_labels <- de_results %>%
  filter(signif != "NS") %>%
  arrange(adj.P.Val) %>%
  head(20)

p_volcano <- ggplot(de_results,
                     aes(x = logFC, y = -log10(adj.P.Val), color = color_grp)) +
  geom_point(alpha = 0.5, size = 1.8) +
  geom_label_repel(data = top_labels, aes(label = gene),
                   size = 2.8, max.overlaps = 20,
                   box.padding = 0.35, segment.color = "gray60") +
  scale_color_manual(values = c("Upregulado"   = "#c0392b",
                                 "Downregulado" = "#2980b9",
                                 "NS"           = "gray75")) +
  geom_hline(yintercept = -log10(0.05), linetype = "dashed", color = "gray40") +
  geom_vline(xintercept = c(-0.5, 0.5), linetype = "dashed", color = "gray40") +
  annotate("text", x = max(de_results$logFC) * 0.7, y = 0.5,
           label = paste0(sum(de_results$color_grp == "Upregulado"), " up"),
           color = "#c0392b", size = 3.5) +
  annotate("text", x = min(de_results$logFC) * 0.7, y = 0.5,
           label = paste0(sum(de_results$color_grp == "Downregulado"), " down"),
           color = "#2980b9", size = 3.5) +
  labs(
    title    = paste("Volcano Plot — DEA:", dea_label),
    subtitle = "Leucemia Linfoide Aguda (TARGET ALL)",
    x        = "log2 Fold Change",
    y        = expression(-log[10](adj.~p-value)),
    color    = NULL
  ) +
  theme_classic(base_size = 13) +
  theme(plot.title = element_text(face = "bold"), legend.position = "top")

ggsave(paste0(out, "fig2_volcano.png"), p_volcano,
       width = 9, height = 7, dpi = 300, bg = "white")
print(p_volcano)
message("fig2_volcano.png salvo.")

# ---- MA Plot ----
p_ma <- ggplot(de_results, aes(x = AveExpr, y = logFC, color = color_grp)) +
  geom_point(alpha = 0.45, size = 1.5) +
  geom_hline(yintercept = 0, color = "black", linewidth = 0.6) +
  geom_smooth(aes(group = 1), method = "loess", se = FALSE,
              color = "gray40", linewidth = 0.7) +
  scale_color_manual(values = c("Upregulado"   = "#c0392b",
                                 "Downregulado" = "#2980b9",
                                 "NS"           = "gray75")) +
  labs(
    title    = "MA Plot — Expressão Diferencial",
    subtitle = dea_label,
    x = "Expressão Média (log2)", y = "log2 Fold Change", color = NULL
  ) +
  theme_classic(base_size = 13) +
  theme(plot.title = element_text(face = "bold"), legend.position = "top")

ggsave(paste0(out, "fig3_maplot.png"), p_ma,
       width = 8, height = 6, dpi = 300, bg = "white")
print(p_ma)
message("fig3_maplot.png salvo.")

# ---- Heatmap — Top 40 DEGs (PNG alta resolução + Top 15 no painel) ----
top_deg_genes <- de_results %>%
  filter(signif != "NS") %>%
  arrange(adj.P.Val) %>%
  head(40) %>%
  pull(gene)
top_deg_genes <- intersect(top_deg_genes, rownames(expr_dea))

if (length(top_deg_genes) >= 5) {
  heat_mat    <- expr_dea[top_deg_genes, ]
  heat_scaled <- t(scale(t(heat_mat)))
  heat_scaled[heat_scaled >  3] <-  3
  heat_scaled[heat_scaled < -3] <- -3

  col_annot <- data.frame(Grupo = as.character(groups),
                           row.names = colnames(expr_dea))
  ann_col   <- list(Grupo = setNames(c("#2980b9", "#c0392b"), levels(groups)))

  png(paste0(out, "fig4_heatmap_DEG.png"), width = 2800, height = 2200, res = 300)
  pheatmap(
    heat_scaled,
    main              = paste("Heatmap — Top", length(top_deg_genes),
                               "DEGs (Relapse vs None)"),
    color             = colorRampPalette(c("#2166ac", "#f7f7f7", "#d6604d"))(100),
    annotation_col    = col_annot,
    annotation_colors = ann_col,
    cluster_rows      = TRUE, cluster_cols  = TRUE,
    show_colnames     = FALSE, fontsize_row  = 8,
    border_color      = NA
  )
  dev.off()
  message("fig4_heatmap_DEG.png salvo.")

  top15  <- intersect(top_deg_genes[1:min(15, length(top_deg_genes))],
                       rownames(expr_dea))
  heat15 <- t(scale(t(expr_dea[top15, ])))
  heat15[heat15 >  3] <-  3
  heat15[heat15 < -3] <- -3
  pheatmap(
    heat15,
    main              = "Heatmap — Top 15 DEGs (Relapse vs None)",
    color             = colorRampPalette(c("#2166ac", "#f7f7f7", "#d6604d"))(100),
    annotation_col    = col_annot,
    annotation_colors = ann_col,
    cluster_rows      = TRUE, cluster_cols  = TRUE,
    show_colnames     = FALSE, fontsize_row  = 11,
    border_color      = NA
  )
}


# ##############################################################################
# BLOCO 5 — CURVAS DE KAPLAN-MEIER
# ##############################################################################

message("\n", strrep("=", 65))
message("  BLOCO 5 — Curvas de Kaplan-Meier")
message(strrep("=", 65))

km_candidates <- de_results %>%
  filter(signif != "NS") %>%
  arrange(adj.P.Val) %>%
  head(10) %>%
  pull(gene)

if (!is.null(top30_genes)) {
  km_candidates <- unique(c(km_candidates,
                              intersect(top30_genes$Gene, rownames(expr_sub))))
}
km_candidates <- km_candidates[km_candidates %in% rownames(expr_sub)]
km_candidates <- km_candidates[1:min(10, length(km_candidates))]
message("Genes para KM: ", paste(km_candidates, collapse = ", "))

# Função KM — dicotomiza pela mediana de expressão
plot_km <- function(gene, expr_mat, clin, surv_label = "OS") {
  ids <- intersect(colnames(expr_mat), rownames(clin))
  df  <- data.frame(
    time  = as.numeric(clin[ids, "surv_time"]),
    event = as.integer(clin[ids, "surv_event"]),
    expr  = as.numeric(expr_mat[gene, ids])
  ) %>% filter(!is.na(time), !is.na(event), time > 0, !is.na(expr))

  med_cut <- median(df$expr, na.rm = TRUE)
  n_alto  <- sum(df$expr >= med_cut)
  n_baixo <- sum(df$expr <  med_cut)

  df$grupo <- factor(ifelse(df$expr >= med_cut,
                             paste0("Alto (n=", n_alto,  ")"),
                             paste0("Baixo (n=", n_baixo, ")")))

  km_fit <- survfit(Surv(time, event) ~ grupo, data = df)

  ggsurvplot(
    km_fit, data = df,
    pval              = TRUE,
    conf.int          = TRUE,
    risk.table        = TRUE,
    risk.table.height = 0.28,
    palette           = c("#c0392b", "#2980b9"),
    title             = paste0("KM — ", gene, "  (", surv_label, ")"),
    xlab              = "Tempo (meses)",
    ylab              = "Probabilidade de Sobrevida",
    legend.title      = paste("Expressão de", gene),
    legend.labs       = levels(df$grupo),
    ggtheme           = theme_classic(base_size = 12)
  )
}

km_plots <- list()
for (gene in km_candidates) {
  tryCatch({
    p_km <- plot_km(gene, expr_sub, clin_sub, surv_label = surv_type)
    km_plots[[gene]] <- p_km
    png(paste0(out, "fig5_KM_", gene, ".png"),
        width = 2200, height = 2000, res = 300)
    print(p_km)
    dev.off()
    message("KM salvo: ", gene)
  }, error = function(e) {
    message("KM falhou para ", gene, ": ", e$message)
  })
}

if (length(km_plots) > 0) print(km_plots[[1]])

if (length(km_plots) >= 2) {
  png(paste0(out, "fig5_KM_painel.png"), width = 4400, height = 4000, res = 300)
  arrange_ggsurvplots(
    km_plots[1:min(4, length(km_plots))],
    ncol = 2, nrow = 2,
    title = paste("Curvas KM — Genes Prognósticos (", surv_type, ")")
  )
  dev.off()
  message("fig5_KM_painel.png salvo.")
}

# Para exibir gene específico: print(km_plots[["NOME_DO_GENE"]])
# Para salvar gene específico isoladamente:
#   png(paste0(out, "fig5_KM_NOME_individual.png"), width=2200, height=2000, res=300)
#   print(km_plots[["NOME_DO_GENE"]]); dev.off()
# Para navegar por todos:
#   for (gene in names(km_plots)) { print(km_plots[[gene]]); readline("Enter...") }


# ##############################################################################
# BLOCO 6 — REGRESSÃO DE COX (TEMPO DE SOBREVIDA)
# ##############################################################################

message("\n", strrep("=", 65))
message("  BLOCO 6 — Análise de Cox")
message(strrep("=", 65))

genes_cox <- km_candidates[km_candidates %in% rownames(expr_sub)]
cox_ids   <- intersect(colnames(expr_sub), rownames(clin_sub))
cox_expr  <- t(expr_sub[genes_cox, cox_ids])

# dplyr::select explícito — evita conflito com AnnotationDbi::select
cox_df <- as.data.frame(cox_expr) %>%
  rownames_to_column("sample_id") %>%
  left_join(
    clin_sub %>%
      rownames_to_column("sample_id") %>%
      dplyr::select(sample_id, surv_time, surv_event),
    by = "sample_id"
  ) %>%
  filter(!is.na(surv_time), !is.na(surv_event), surv_time > 0) %>%
  mutate(surv_time  = as.numeric(surv_time),
         surv_event = as.integer(surv_event)) %>%
  column_to_rownames("sample_id")

cox_df_scaled <- cox_df %>%
  mutate(across(all_of(genes_cox), ~as.numeric(scale(.))))

message("N amostras para Cox: ", nrow(cox_df_scaled))

# ---- Cox univariado ----
cox_univar <- map_dfr(genes_cox, function(gene) {
  tryCatch({
    f   <- as.formula(paste0("Surv(surv_time, surv_event) ~ `", gene, "`"))
    fit <- coxph(f, data = cox_df_scaled)
    s   <- summary(fit)
    tibble(
      Gene     = gene,
      HR       = round(exp(coef(fit)), 3),
      HR_lower = round(s$conf.int[, 3], 3),
      HR_upper = round(s$conf.int[, 4], 3),
      p_value  = round(s$coefficients[, 5], 4),
      p_signif = ifelse(s$coefficients[, 5] < 0.05, "*", "")
    )
  }, error = function(e) {
    message("Cox falhou para ", gene, ": ", e$message); NULL
  })
})

message("\nCox Univariado:")
print(cox_univar)
write.csv(cox_univar, paste0(out, "cox_univariado.csv"), row.names = FALSE)
message("cox_univariado.csv salvo.")

# ---- Forest Plot ----
p_forest <- cox_univar %>%
  mutate(Gene = reorder(Gene, HR)) %>%
  ggplot(aes(x = HR, y = Gene)) +
  geom_vline(xintercept = 1, linetype = "dashed", color = "gray50") +
  geom_errorbar(aes(xmin = HR_lower, xmax = HR_upper),
                height = 0.25, color = "gray30", orientation = "y") +
  geom_point(aes(color = HR > 1, size = -log10(p_value + 1e-6))) +
  geom_text(aes(label = paste0("HR=", HR, "  p=", p_value, p_signif)),
            x = max(cox_univar$HR_upper) * 1.05,
            hjust = 0, size = 3, color = "gray20") +
  scale_color_manual(values = c("TRUE"  = "#c0392b", "FALSE" = "#2980b9"),
                     labels = c("TRUE"  = "HR > 1 (Risco↑)",
                                "FALSE" = "HR < 1 (Protetor)")) +
  scale_size_continuous(range = c(2, 6), name = "-log10(p)") +
  scale_x_continuous(expand = expansion(mult = c(0.05, 0.35))) +
  labs(
    title    = "Forest Plot — Cox Univariado",
    subtitle = paste("Endpoint:", surv_type),
    x = "Hazard Ratio (IC 95%)", y = NULL, color = NULL
  ) +
  theme_classic(base_size = 12) +
  theme(plot.title = element_text(face = "bold"), legend.position = "bottom")

ggsave(paste0(out, "fig6_forest_cox.png"), p_forest,
       width = 10, height = 6, dpi = 300, bg = "white")
print(p_forest)
message("fig6_forest_cox.png salvo.")

# ---- Cox multivariado (genes com p < 0.1) ----
sig_genes_cox <- cox_univar %>% filter(p_value < 0.1) %>% pull(Gene)

if (length(sig_genes_cox) >= 2) {
  vars_multi    <- paste0("`", sig_genes_cox, "`", collapse = " + ")
  formula_multi <- as.formula(paste0("Surv(surv_time, surv_event) ~ ", vars_multi))
  cox_multi     <- coxph(formula_multi, data = cox_df_scaled)
  message("\nCox Multivariado:")
  print(summary(cox_multi))

  # Extração manual dos coeficientes — nomes como "exp(coef)" e
  # "Pr(>|z|)" possuem caracteres especiais incompatíveis com
  # dplyr::rename(); renomear por posição via names<- é mais robusto.
  multi_res        <- summary(cox_multi)$coefficients %>% as.data.frame()
  names(multi_res) <- c("coef", "HR", "se_coef", "z", "p_value")
  multi_res        <- multi_res %>%
    rownames_to_column("Gene") %>%
    mutate(Gene = str_remove_all(Gene, "`"))

  write.csv(multi_res, paste0(out, "cox_multivariado.csv"), row.names = FALSE)
  message("cox_multivariado.csv salvo.")
  message("\nResumo — HR e p-value por gene:")
  print(multi_res[, c("Gene", "HR", "p_value")])

} else {
  message("Genes insuficientes (p<0.1) para Cox multivariado.")
}