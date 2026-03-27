# Designing Figure 1 of the Paper

[MULTIMODAL — requires viewing the figure image]

## Tools

draw.io (available on Google Drive) is great for creating flowcharts and diagrams.

## Exporting the Diagram for Papers

Export as "PDF" or "SVG", so that it is of high clarity, selectable text, and scalable when readers zoom in. Then you can still do the normal `\begin{figure}` in Overleaf for the PDF.

## Main Spirit of Figure 1

You can use image generators to help create compelling Figure 1 visuals.

### High-Level Goals
- **Use a good example** that clearly articulates the paper's primary mechanism, is plausibly producible by the proposed approach, and contains something memorable.
- **Maintain moderately high information density** — avoid appearing sparse or lacking content.
- **The Figure 1 + caption package should be self-contained** — understandable to someone in your field without reading the full paper.

### Design Principles
- **Start on paper.** Sketch initial designs by hand before going digital to avoid misjudging spatial constraints.
- **Introduce concepts deliberately.** Each concept in the figure requires explanation in the caption. Balance communicating scope with clearly conveying the key idea.
- **Center subjects** to create a graph-like impression rather than a list-like layout.
- **Label generously** for clarity. Spell-check all text in figures thoroughly.
- Add visual weight through solid color backgrounds, icon usage, and thickened lines.
- Share drafts with collaborators unfamiliar with the project to simulate a fresh reader perspective.

## Font Size in Figures

The smallest font size that readers are comfortable with (when printing on A4 paper) should be `\footnotesize`. Any text in the figure should have sizes between the footnote size and normal text size in the main paper. Create a placeholder figure with legible text to reference while designing.

## Color in Figures

- Use color to convey meaning and enable semantic grouping across space.
- Restrict color palette — use as few colors as feasible.
- Start with curated palettes (e.g., ColorBrewer for scales/categories).
- See `04_figures_and_tables/color_palettes.md` for palette recommendations.

## Figure Placement

- Place tables, figures, graphs, and algorithms at page tops, not mid-text.
- Ensure elements appear on the same page as the first reference or on the following page.
