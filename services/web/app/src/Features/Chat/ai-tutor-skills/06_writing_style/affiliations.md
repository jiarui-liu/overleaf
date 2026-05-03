# Affiliations

This skill provides the official affiliation rules for Jinesis Lab papers. Use it to verify and correct author affiliation lines.

## IMPORTANT — Where to Check

Author affiliations appear in the LaTeX **preamble** (before `\begin{document}`), typically inside `\author{}`, `\affil{}`, `\institute{}`, or `\affiliations{}` commands. **You MUST inspect this part of the document** when reviewing for affiliation compliance.

## Common Violations to Flag

Flag any of the following as a **[warning]** comment, highlighting the offending `\affil` or `\author` line:

1. **"Jinesis AI Lab"** or any variant containing "AI" (e.g., "JAIL", "Jinesis AI", "Jinesis Artificial Intelligence Lab") — the correct name is **"Jinesis Lab"** without "AI".
2. **"MPI for Intelligent Systems"** used when space is not constrained — the full form "Max Planck Institute for Intelligent Systems, Tübingen, Germany" should be preferred.
3. **Missing "Vector Institute"** — lab members should use "Jinesis Lab, University of Toronto & Vector Institute", not just "Jinesis Lab, University of Toronto".
4. **Incorrect ordering or formatting** of the official affiliation strings listed below.

## Official Affiliation Strings

### Zhijing Jin (PI)

- **Full form (preferred):** Max Planck Institute for Intelligent Systems, Tübingen, Germany
- **Short form (only when space is constrained):** MPI for Intelligent Systems

### Lab Members (default)

Most lab members should use:

> Jinesis Lab, University of Toronto & Vector Institute

**Do NOT include "AI" or "Artificial Intelligence" in the lab name.** The correct name is "Jinesis Lab" — never "Jinesis AI Lab".

### EuroSafeAI

A subset of lab members also list **EuroSafeAI** as a secondary affiliation, per the lab's affiliation policy.

## When to Use Only Lab Affiliations

Use only the Jinesis Lab (and optionally EuroSafeAI) affiliations when the author falls into one of these categories:

- Undergraduates or Master's students whose primary work is with the lab.
- Lab-funded PhD students.
- External collaborators who worked on the project **outside** their normal employment (e.g., someone whose day job is at a company but who contributed during personal time).

Papers listing only Jinesis Lab and EuroSafeAI maximize the lab's visibility and are preferred whenever the policy allows it.

## When to Add External Affiliations

List an author's external affiliation when:

- They are **paid by another professor or institute** (e.g., a student whose primary salary comes from a different advisor or university).
- Their employer requires affiliation disclosure.

Co-authorships with employees of profit-driven companies are uncommon, as most large companies require a multi-month internal approval process for publications.
