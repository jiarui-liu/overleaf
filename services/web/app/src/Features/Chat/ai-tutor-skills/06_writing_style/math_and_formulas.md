# Math and Formula Formatting

[TEXT — no multimodal needed]

## Key Commands

The most important commands to learn include `\mathrm` and `\bm`.

## Formula Numbering

Any formula should be numbered. Usually recommend `\begin{align}` but you can use other environments too.

## Equations as Part of Sentences

All equations and math should be treated as nouns and embedded in a sentence with appropriate punctuation. For example: "The voltage is $V=IR$, where $I$ is the current."

## Style Tips

- Use `\mathrm` for text within math mode.
- Use `^\top` for transpose instead of `^T`.
- Use `\left` and `\right` for big parentheses that scale automatically.
- Avoid unnecessary colons before equations. Example:
  - Correct: "The relationship between the radius and area of a circle is $A = r^2 \pi$."
  - Wrong: "The relationship between the radius and area of a circle is: $A = r^2 \pi$."

## Readability

- **Refer to notation together with their name.** Nothing is more frustrating than flipping pages to figure out what notations mean.
- **Write in a consistent format.** Reduce the mental load of readers by using the same format for similar expressions.
- **Avoid redundant notation.** If you will not use a symbol again, you do not need to introduce it.
- **Simplify notation.** For example, avoid parenthesized indexes when simpler subscripts work.
- **Define notation macros** with descriptive names to avoid notation inconsistency in the paper.
- Use `$-1$` for negative numbers in text — a bare "-" is interpreted as a hyphen by LaTeX.

## Formatting Rules

- Do not allow an additional line between the formula and text.
- Always add "," or "." at the end of the formula — formulas are part of sentences and need punctuation.
- Define all variables before use, only once. Group global definitions in a Preliminaries section if needed.
- Only introduce symbols and acronyms that you actually use in the paper.
