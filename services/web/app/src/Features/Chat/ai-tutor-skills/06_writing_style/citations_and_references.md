# Citations and References

[TEXT — no multimodal needed]

## Reference Priority Order

For all references, prioritize:
1. ACL's default bib entry from aclanthology.org
2. dblp.org
3. Conference website's official bib
4. Finally Google Scholar — but double check correctness. Sometimes check how other papers cite the same resource to ensure all publication info is correct.

## BibTeX Alias Convention

Use Google Scholar-style alias for each bib entry, e.g.:

```bibtex
@inproceedings{jin2024large,
    title        = {Can Large Language Models Infer Causation from Correlation?},
    author       = {Zhijing Jin and Jiarui Liu and ...},
    year         = 2024,
    booktitle    = {The Twelfth International Conference on Learning Representations, {ICLR} 2024},
    publisher    = {OpenReview.net}
}
```

## \citet{} vs \citep{}

You need to properly distinguish `\citet{}` and `\citep{}`. Think of it as a grammatical rule.

- Use `\citet` when authors are part of the sentence: "\citet{foerster2016learning} show..."
- Use `~\citep` otherwise: "...recent work~\citep{foerster2016learning}"
- For acronym + citation: "proximal policy optimisation \citep[PPO]{schulman2017ppo}"

## Citation Framing

Sentences citing previous work should be framed unambiguously about which contribution was done by previous work. There should not be multiple ways to interpret who takes the credit of what.

Bad example: "We build on the approach of Smith et al. (2023), achieving state-of-the-art results."
(Unclear whether the "approach" or "state-of-the-art results" belong to Smith et al.)

Good example: "Smith et al. (2023) proposed X. We extend their approach by Y, achieving state-of-the-art results."

## Citation Grammar

- Parenthetical citations should not assume grammatical roles in the sentence. Test by mentally removing the parentheses — the sentence should still be grammatically correct and purposeful.
- When naming authors in sentences, place the citation afterward: "Gao (2019) found..." — do not use citations as nouns.

## Quotation vs. Paraphrase

- **Quotation:** Verbatim text requires quotation marks (or indented formatting) plus a citation.
- **Paraphrase:** Restated ideas in your own words still require citations, but no quotation marks.

## Citation Completeness

- Don't forget citations when making a claim. Cite any claim that is not supported by your own experiments.
- Don't forget to add links to datasets when mentioning them.
- Add references to the first work using a methodology.
- Spend the effort to make all citations complete and consistent. Do not just copy random inconsistent BibTeX entries from the web.
- Cite the correct version of published papers. Google Scholar often defaults to the arXiv version rather than the conference paper — click "All versions" and choose the published one.
- Check for broken references and citations in the PDF (indicated by "??").

## Citation Management

- Use BibTeX instead of manual formatting. Employ citation managers like Zotero for tracking.
- Repair sloppy online BibTeX code before using — always verify imported reference information for accuracy.
