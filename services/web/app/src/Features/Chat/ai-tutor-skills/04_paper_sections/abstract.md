# Writing the Abstract

[TEXT — no multimodal needed]

## Structure: Sentence-by-Sentence Guide

**Sentence 1:**
If the task is not self-evident to every reader, then define it. Else, directly highlight its importance and broad application.

**Sentence 2:**
Summarize problems in related work, their limitations, negligence, etc.

**Sentence 3:**
We propose..., and then highlight key points in our method innovation.

**Sentence 4:**
Talk about experimental results, highlight our improvement %.

**Sentence 5 (Optional):**
Say something like "Our work opens the paveway/lays the foundation for future XXX."

## Example of a Well-Written Abstract

"Text attribute transfer aims to automatically rewrite sentences such that they possess certain linguistic attributes, while simultaneously preserving their semantic content. This task remains challenging due to a lack of supervised parallel data. Existing approaches try to explicitly disentangle content and attribute information, but this is difficult and often results in poor content-preservation and ungrammaticality. In contrast, we propose a simpler approach, Iterative Matching and Translation (IMaT), which: (1) constructs a pseudo-parallel corpus by aligning a subset of semantically similar sentences from the source and the target corpora; (2) applies a standard sequence-to-sequence model to learn the attribute transfer; (3) iteratively improves the learned transfer function by refining imperfections in the alignment. In sentiment modification and formality transfer tasks, our method outperforms complex state-of-the-art systems by a large margin. As an auxiliary contribution, we produce a publicly-available test set with human-generated transfer references."

### Mapping the Example to the Structure

- **Sentence 1** (define the task): "Text attribute transfer aims to automatically rewrite sentences..."
- **Sentence 2** (problems in related work): "This task remains challenging due to... Existing approaches try to... but this is difficult and often results in..."
- **Sentence 3** (our proposal): "In contrast, we propose a simpler approach, IMaT, which: (1)...; (2)...; (3)..."
- **Sentence 4** (experimental results): "...our method outperforms complex state-of-the-art systems by a large margin."
- **Sentence 5** (auxiliary contribution): "As an auxiliary contribution, we produce a publicly-available test set..."

## General Abstract Tips

- The abstract should describe **the work**, not the paper. Focus on what was done and what was found.
- Include at most one sentence of motivation; save the rest for the introduction.
- Be specific about key results — instead of "many," say "84%." Instead of "large improvement," say "5.46% improvement."
- Keep the abstract to one paragraph.

## The Matryoshka Doll Principle

The Abstract, Introduction, and Body are like Russian nesting dolls. The Abstract is a summary of the Introduction, and the Introduction is a summary of the whole paper. Roughly speaking, every sentence in the Abstract becomes a paragraph in the Introduction, and every paragraph in the Introduction becomes a key section in the paper. Start writing the Abstract as soon as possible — even before results are finalized — to sharpen focus and highlight issues with the method or experiments early.

## Tips for Multiple Result Sections

If the paper has multiple result sections, already hint at them in the abstract, including referring to the sections.

## Improvement Prompting Template

```
Your task is to improve the following academic paper abstract:
<<abstract here>>

Here is some guidance for producing a suitable abstract:
<<guidance from the Structure section above>>

Here is an example of a well written abstract which conforms to the guidance:
<<example from above>>

Make improvements to this abstract in line with the guidance. First, provide a bullet list of the improvements that have been made. Finally, output the improved abstract.
```
