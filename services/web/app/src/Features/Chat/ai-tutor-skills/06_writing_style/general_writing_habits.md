# General Writing Habits

[TEXT — no multimodal needed]

## First Sentences Tell the Whole Story

A paragraph represents a single statement or claim. The first sentence should introduce the claim, and the body of the paragraph should present supporting evidence or arguments. A quick check: read just the first sentences of every paragraph — they should tell the whole story of the paper.

## Every Section Tells a Story

Every section of the paper should tell a story with linear progression and no significant interruptions. Each sentence's placement should have clear reasoning discoverable without reading ahead.

## Consistency in Presentation

- Be consistent in presentation form across the paper. If one subsection uses bullet point lists, parallel subsections should use a similar format.
- Be consistent with terminology. If something is called "refBLEU" in one place, use the same term everywhere. Avoid synonyms for work-specific terminology at all costs.
- Maintain uniform capitalization, punctuation, grammar, and formatting throughout.
- Introduce terminology that is specific to this work. If it risks being confusing, mention it right next to it: "This should not be confused with..."

## Headings for Readability

- Have one heading every ~10 or 15 lines, to keep the reader attentive.
- Fast readers (spending 10 sec per page) should still get good takeaways.
- Use bold phrases at the start of paragraphs when there are multiple paragraphs in a subsection.

## Put Readers First

- Convey the intuition first — once the reader has the intuition, they can follow the details, but not vice versa.
- Use concrete examples to introduce ideas before diving into formalism.
- Test narrative flow by speaking text aloud to detect incoherence.

## Avoid Generic, LLM-Sounding Openers

Flag sentences that could open any paper in the field and say nothing about this one. The most common shape is "X is increasingly used across A, B, and C" or "X has attracted growing attention in recent years", often followed by a list of domains (healthcare, finance, education, ...). Reviewers read these as filler, and they are a strong signal of machine-written text.

Suggest opening instead with the specific problem, the gap, or a concrete fact or number that only this paper would state. Quote the offending sentence and give a rewrite that starts from the paper's own claim.

## Voice: Formal Third Person

- Write in a formal register. Do not address the reader as "you", and do not use first person singular ("I").
- Refer to the work and its parts in the third person ("This paper shows", "the model", "Section 4 reports"). Authorial "we" for the authors' own actions ("we train", "we propose") is fine.
- No emoji anywhere in the paper body, captions, tables or section titles. Use words, or a symbol from the math font (e.g. `\checkmark`, `\times`) in tables.

