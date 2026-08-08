# Voice Guide (example / template)

This is the committed example. The real file lives next to it as `voice.md` and is git-ignored, exactly like `.env` versus `.env.example`. Copy this to `voice.md` and fill it in with one specific person's voice, or point an agent at a corpus and have it build `voice.md` from the instructions below.

## Why this exists

Personify strips the statistical fingerprints of LLM writing. On its own, that makes prose *not obviously AI* and also *not obviously anyone*: clean, competent, anonymous. A voice guide is the other half. It describes how one real person actually writes, so Personify has something to preserve instead of a blank to sand flat. Without a `voice.md` present, Personify runs in generic mode and should tell you so.

## How Personify uses it

Personify's Step 0 looks for `voice.md` in the skill directory. If it exists, Personify reads it and treats it as authoritative: where the general pattern list and the voice guide disagree, the voice guide wins, and the pattern list becomes a backstop for residue. If `voice.md` is absent, Personify falls back to generic cleanup and points here.

## How to build a `voice.md`

Feed an agent a corpus of writing that is unambiguously the person's own, then have it extract distinctive, reproducible features. Guidance:

- **Source, highest signal first:** long-form deliberate writing (blog posts, essays, published docs), then long personal emails *the person sent* (strip quoted replies, forwarded text, and signatures, or you'll analyze other people's words), then in-repo READMEs and docs. Skip logistics email and boilerplate.
- **Capture idiosyncrasy, not an average.** The goal is the person's fingerprints: recurring constructions, punctuation habits, how they open and close, the specific joke they keep reaching for. Averaging all their writing into one bland profile recreates the problem you're trying to solve.
- **Be register-aware.** Most people code-switch (formal vs. casual, technical vs. personal, earnest vs. satirical). Name the registers and how to pick one, rather than flattening them together.
- **Anchor every claim in a short real quote** from the corpus, so the feature is checkable and falsifiable by the person.
- **List the conflicts.** Note which generic Personify rules this person's real voice overrides, so Personify stops flagging their signatures as machine artifacts.

## Suggested structure

Mirror the sections below in `voice.md`:

- **The one line** — a single sentence capturing the person's core stance or posture.
- **Picking the register** — the named registers and how to choose one from context.
- **The fingerprint** — the cross-register constants: the features that hold regardless of register. Each with a short real quote.
- **Register-specific notes** — what changes in each register.
- **Conflicts with Personify** — the generic rules this voice overrides, and why.
- **Corpus** — what was analyzed, and what's still unsampled. Version it.
