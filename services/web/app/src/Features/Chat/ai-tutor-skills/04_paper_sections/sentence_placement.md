# Sentence Placement

[TEXT]

A sentence can be well written and still sit in the wrong place. Readers expect each section, and often each paragraph slot within a section, to do a specific job. A finding stated in the introduction's motivation paragraph, or a design justification buried in the results, forces the reader to hold it until they reach the part of the paper it belongs to.

## What each part of a paper is for

| Part | Its job | Sentences that usually belong elsewhere |
|------|---------|------------------------------------------|
| Abstract | Context → gap → approach → headline result → impact, in one pass | Implementation details, hedged side findings |
| Introduction ¶1 | The problem and why anyone should care | Method details, numeric results |
| Introduction, middle | What is missing in prior work; the idea of this paper | Full related-work surveys (→ Related Work), experimental setup (→ Experimental Setup) |
| Introduction, last ¶s | Contributions list; headline findings | Long result discussion (→ Results) |
| Related Work | Situating the paper among prior work, compare-and-contrast | This paper's own results, motivation for the problem |
| Methods / Task formulation | What was done, and why each design choice was made | Results, comparisons to baselines' numbers, experimental setup (→ Experimental Setup) |
| Experimental Setup | Goals/RQs of the experiments; datasets, models, baselines, metrics, hyperparameters, prompts, implementation and compute details | Any result or finding (→ Results) |
| Results ¶1 (and each RQ's ¶1) | The summary of key findings, stated up front | Any setup detail (→ Experimental Setup), method recap (→ Methods), roadmaps that delay the findings |
| Results, later ¶s | Evidence, per-table/figure interpretation, ablations | Setup detail beyond a clause naming what a figure/table reports (→ Experimental Setup), motivation (→ Introduction), method definitions (→ Methods) |
| Conclusion | Short recap, implications, future work | New results, new details never mentioned before |
| Limitations / Ethics | Honest scope boundaries | Defensive restatements of contributions |
| Appendix | Supporting detail a careful reader may want | Anything the main claims depend on (→ main text) |

## Hard rules

These apply whatever the prototype does:

1. **Setup goes in the Experimental Setup section.** Sentences that say which dataset, model, baseline, metric, hyperparameter, prompt or hardware is used are setup. If one sits in an Experiments / Results paragraph, move it to the setup section. If the paper has no setup section, move it to a new one placed before the results.
2. **Results open with the findings.** The first paragraph of the Experiments / Results section is the summary of key findings. Move setup, method recaps and roadmaps out of it; move a findings summary that appears later to its start.

## How to use prototype papers

Prototype papers show where a strong paper of the same kind puts each type of sentence. Use them for **placement**, not content:

- Identify the *rhetorical role* of the user's sentence (e.g. "headline quantitative finding", "definition of the task", "limitation of prior work", "roadmap of the section").
- Find where the prototype places a sentence with the *same role*, down to the section and paragraph slot (e.g. "first paragraph of Results", "last paragraph of the Introduction").
- Suggest a move only if the user's sentence sits in a clearly different slot, and the move would make the paper easier to follow.

Do not suggest moves just because the topics differ from the prototype. A dataset paper's prototype says nothing about where a theorem goes.
