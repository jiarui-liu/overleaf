#!/usr/bin/env bash
# Download all example papers referenced in 01_setup/example_papers_guide.md
# Run from the example_papers/ directory.
# Two files cannot be auto-downloaded (noted below):
#   - nature_s41586-024-08328-6_color_palette.pdf  (Nature — paywalled)
#   - marr_1982_trilevel.pdf                        (1982 book chapter — not freely available)

set -euo pipefail
DEST="$(dirname "$0")"
UA="Mozilla/5.0 (compatible; academic-paper-downloader)"

download() {
  local url="$1" dest="$2"
  if [[ -f "$dest" ]]; then
    echo "  [skip] $(basename "$dest") already exists"
    return
  fi
  echo "  [dl]   $(basename "$dest")"
  curl -L --silent --show-error --fail -A "$UA" -o "$dest" "$url" || echo "  [WARN] failed: $url"
  sleep 1   # be polite to servers
}

echo "=== arXiv papers ==="
download "https://arxiv.org/pdf/1808.07042"  "$DEST/1808.07042_coqa.pdf"
download "https://arxiv.org/pdf/1806.03822"  "$DEST/1806.03822_squad2.pdf"
download "https://arxiv.org/pdf/1810.13083"  "$DEST/1810.13083_task_formulation.pdf"
download "https://arxiv.org/pdf/2006.03719"  "$DEST/2006.03719_task_formulation.pdf"
download "https://arxiv.org/pdf/2405.14808"  "$DEST/2405.14808_implicit_personalization.pdf"
download "https://arxiv.org/pdf/2210.01478"  "$DEST/2210.01478_moralexceptqa.pdf"
download "https://arxiv.org/pdf/2305.05471"  "$DEST/2305.05471_figure1_example.pdf"
download "https://arxiv.org/pdf/2310.02949"  "$DEST/2310.02949_figure1_imagegen.pdf"
download "https://arxiv.org/pdf/2009.07964"  "$DEST/2009.07964_related_work.pdf"
download "https://arxiv.org/pdf/2110.03618"  "$DEST/2110.03618_related_work.pdf"
download "https://arxiv.org/pdf/2403.11807"  "$DEST/2403.11807_extensive_results.pdf"
download "https://arxiv.org/pdf/2402.11655"  "$DEST/2402.11655_llm_inference_findings.pdf"
download "https://arxiv.org/pdf/2407.02273"  "$DEST/2407.02273_results_section.pdf"
download "https://arxiv.org/pdf/2506.22957"  "$DEST/2506.22957_multiple_results.pdf"
download "https://arxiv.org/pdf/2310.13544"  "$DEST/2310.13544_clearly_structured.pdf"
download "https://arxiv.org/pdf/2305.13169"  "$DEST/2305.13169_plots_example.pdf"
download "https://arxiv.org/pdf/2504.07086"  "$DEST/2504.07086_analysis_paper.pdf"
download "https://arxiv.org/pdf/2301.09008"  "$DEST/2301.09008_format_visuals.pdf"
download "https://arxiv.org/pdf/2202.07206"  "$DEST/2202.07206_number_frequency.pdf"
download "https://arxiv.org/pdf/2308.16137"  "$DEST/2308.16137_lm_infinite.pdf"
download "https://arxiv.org/pdf/2212.01681"  "$DEST/2212.01681_position_paper_andreas.pdf"
download "https://arxiv.org/pdf/1810.05903"  "$DEST/1810.05903_halpern_responsibility.pdf"
download "https://arxiv.org/pdf/cs/0011012"  "$DEST/cs0011012_halpern_causes.pdf"
download "https://arxiv.org/pdf/2502.12110"  "$DEST/2502.12110_method_improvement.pdf"
download "https://arxiv.org/pdf/2202.13758"  "$DEST/2202.13758_dataset_visualization.pdf"
download "https://arxiv.org/pdf/2306.05836"  "$DEST/2306.05836_dataset_statistics.pdf"
download "https://arxiv.org/pdf/2312.04350"  "$DEST/2312.04350_data_construction.pdf"
download "https://arxiv.org/pdf/2212.10678"  "$DEST/2212.10678_dataset_comparison.pdf"
download "https://arxiv.org/pdf/2310.20246"  "$DEST/2310.20246_great_table.pdf"

echo ""
echo "=== ACL Anthology papers ==="
download "https://aclanthology.org/D16-1261.pdf"          "$DEST/D16-1261_emnlp2016_best_paper.pdf"
download "https://aclanthology.org/2023.acl-long.656.pdf" "$DEST/2023.acl-long.656_best_paper.pdf"
download "https://aclanthology.org/N19-1166.pdf"          "$DEST/N19-1166_css_paper.pdf"

echo ""
echo "=== Papers that CANNOT be auto-downloaded ==="
echo "  [manual] nature_s41586-024-08328-6_color_palette.pdf — Nature paper (paywalled)"
echo "           DOI: https://doi.org/10.1038/s41586-024-08328-6"
echo "  [manual] marr_1982_trilevel.pdf — David Marr (1982) Vision book chapter (not freely available)"

echo ""
echo "Done."
