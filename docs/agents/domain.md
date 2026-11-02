# Domain Docs

Engineering skills should consume this repo's domain documentation as follows.

## Before exploring, read these

- `GLOSSARY.md` at the repository root, or `GLOSSARY-MAP.md` if the repo later adopts multiple contexts.
- Relevant ADRs in `docs/adr/` before working in an affected area.

If these files do not exist, proceed silently. The domain-modeling skill creates them lazily when a term is resolved or a decision warrants an ADR.

## File structure

This repo uses a single-context layout: root `GLOSSARY.md` and `docs/adr/`.

## Use the glossary's vocabulary

Use domain terms as defined in `GLOSSARY.md`; do not substitute synonyms the glossary explicitly avoids. If a needed concept is missing, reconsider the language or identify it as a possible glossary gap.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, surface the conflict explicitly and explain why it may warrant revisiting.
