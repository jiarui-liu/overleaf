# Review Sets Guide

[TEXT — no multimodal needed for lookup; MULTIMODAL if fetching the actual paper PDFs/figures]

Before giving writing suggestions, consult the local review sets to find **high-quality accepted papers** on a similar topic. These JSON files contain curated papers from recent top conferences, complete with reviewer scores, strengths, and weaknesses — making them a fast, reliable source of strong examples calibrated to real reviewer standards.

---

## Available Review Sets

All files are located in `review_sets/` relative to the skill library root.

| File | Coverage | Quality Bar |
|------|----------|-------------|
| `review_sets/ICLR2025_50_high_quality_papers.json` | ICLR 2025 — 50 papers | Avg reviewer score ≥ 8; mostly Oral/Spotlight |
| `review_sets/ICLR2025_50_low_quality_papers.json` | ICLR 2025 — 50 papers | Lower scores; rejected or weak accepts |
| `review_sets/NeurIPS2025_100_high_quality_papers.json` | NeurIPS 2025 — 100 papers | High-quality accepts |
| `review_sets/NeurIPS2025_100_low_quality_papers.json` | NeurIPS 2025 — 100 papers | Lower scores; rejected or weak accepts |
| `review_sets/COLM2025_50_high_quality_papers.json` | COLM 2025 — 50 papers | High-quality accepts |

### JSON Entry Structure

Each entry is keyed by OpenReview paper ID and contains:
```json
{
  "title": "...",
  "link": "https://openreview.net/forum?id=...",
  "abstract": "...",
  "decision": "Accept (Oral)",
  "review scores": [10, 10, 8, 10],
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."]
}
```

---

## When to Use the Review Sets

Use these **before** doing any web search for prototype papers (see `finding_prototype_papers.md`). They are especially valuable when:

- The paper's **target venue** is ICLR, NeurIPS, or COLM (matching review sets exist).
- You need to understand what **reviewers valued** in high-scoring papers in this area.
- You want to contrast strong papers against weak ones to identify pitfalls in the paper under review.

---

## How to Search

1. **Identify 3–5 keywords** from the paper's title, abstract, and method (e.g., "safety alignment", "diffusion model", "benchmark evaluation", "retrieval-augmented").

2. **Scan the relevant high-quality JSON** for papers whose `title` or `abstract` contains those keywords. Look for topical overlap — you don't need an exact match, just a paper addressing a similar problem or method family.

3. **Select 2–3 candidates** with the highest `review scores` averages and the strongest topical relevance.

4. **Fetch each paper** via its `link` (OpenReview URL). Read the relevant sections (abstract, introduction, methods, results) to study writing style and structure.

---

## What to Extract from Strong Examples

Once you have identified relevant high-quality papers, study them for:

- **Paper structure:** How sections are organized, how contributions are framed.
- **Clarity of problem statement:** How the gap in prior work is articulated.
- **Experimental design:** What baselines are included, how ablations are structured.
- **Writing quality:** Paragraph flow, how claims are supported, how figures are introduced.

Also read the `strengths` field of each review entry — this tells you **exactly what reviewers praised**, which directly informs what to look for (or improve) in the paper under review.

---

## How to Use the Low-Quality Sets

The `ICLR2025_50_low_quality_papers.json` and `NeurIPS2025_100_low_quality_papers.json` files are negative references. Use the one that matches the target venue. Use them to:

- Recognize patterns that reviewers **penalize**: unsupported claims, missing ablations, overclaiming, limited baselines, unclear motivation.
- Check if the paper under review has any of the same `weaknesses` described in low-scoring reviews.
- Calibrate severity: if the same issue appears repeatedly in rejected papers' weaknesses, it is a critical problem to flag.

---

## Example Lookup Workflow

> **Paper under review:** A new LLM safety fine-tuning method targeting NeurIPS 2025.

1. Keywords: `"safety alignment"`, `"fine-tuning"`, `"LLM"`, `"jailbreak"`.
2. Search `ICLR2025_50_high_quality_papers.json` → find *"Safety Alignment Should be Made More Than Just a Few Tokens Deep"* (avg score 9.5, Oral).
3. Check `NeurIPS2025_100_high_quality_papers.json` for additional relevant entries.
4. Fetch both papers via their OpenReview links; study how they motivate the problem, present baselines, and handle limitations.
5. Compare the paper under review against these strong examples when giving section-level feedback.
