# Plan: mine a 30-year corpus for VOICE.md

**Status:** proposed, not started
**Written:** 2026-08-14

## Why

`VOICE.md` v0.2 is derived from one recent blog corpus. It describes the published voice well and the work voice barely at all, which is the gap that produced a wrong inference: the guide's Conflicts section told Personify to preserve em dashes and complete-sentence fastidiousness at work, which is precisely the register drawing manager warnings.

There is a second, larger reason. The register in question is roughly 30 years old. Andrew wrote in complete sentences with dependent clauses and correct punctuation on Usenet from about 1995 and on Slashdot in the early 2000s, decades before any language model existed. A corpus spanning that range turns "this is how he writes" from an inference off six blog posts into something demonstrable, and it settles the question of whether the flagged register is his or an artifact.

The immediate work register fixes do not depend on this. `VOICE.md` v0.2 already produces what the feedback asked for. This is the durable version.

## Sources, ranked by value per unit of effort

### 1. Gmail sent mail, roughly 2004 to present

Highest value. Two decades of unbroken prose, spanning registers (professional, personal, technical, argumentative) with real timestamps, and it is the only source that covers the work register directly.

Also the most expensive and the most sensitive: it is 22 years of personal mail, most of which has nothing to do with writing style.

### 2. Usenet, roughly 1995 to 2006

The provenance evidence. Establishes the register predates LLMs by 30 years.

Google killed Usenet access in early 2024, so Google Groups is out. Current options:

- `usenetarchives.com`, broad coverage with author search
- Archive Team's Usenet page (`wiki.archiveteam.org/index.php/Usenet`) catalogs other dumps
- `github.com/wolfpld/usenetarchive` is a toolkit for browsing raw archive files offline

Practical constraint: author search is by email address, so this needs the address or addresses Andrew posted from in that era. Coverage before March 1995 is thin everywhere, since the Deja News capture that seeded every later archive started then.

### 3. Slashdot comments, early 2000s

Lowest value. Comments are short and argumentative rather than sustained prose, so they show stance better than register.

No export exists. The FAQ offers account management but no data dump. Options are scraping the comment history while logged in, or mailing <feedback@slashdot.org> to ask.

## Gmail extraction, step by step

### Step 1: export

Google Takeout, Mail only, mbox format. Nothing is on disk yet: `~/Documents/Takeout` contains only an old Google+ export.

Takeout for a large mailbox arrives as multi-gigabyte archives and can take hours to days to generate. Request it early; the rest of this plan blocks on it.

### Step 2: filter to sent-only, stripped

Order matters. Each stage should cut volume before anything reaches a model.

1. **Sent only.** Filter on the `X-Gmail-Labels` header containing `Sent`, or extract the Sent Mail mbox directly if Takeout separates it. Anything else is other people's writing.
2. **Strip quoted and forwarded text.** Remove lines beginning `>`, everything after `On <date>, <person> wrote:`, and forwarded-message blocks. This is the single most important filter: without it the corpus is contaminated with the writing of everyone Andrew has ever replied to.
3. **Strip signatures.** Cut at the RFC 3676 signature delimiter (two hyphens followed by a space, on its own line) and at known signature blocks. Note that markdown linters like to eat the trailing space, so match it in code rather than copying it from this document.
4. **Drop short messages.** A floor around 150 words removes logistics ("sounds good", "see you at 3") that carry no register signal.
5. **Drop boilerplate.** Calendar invites, automated replies, receipts, anything with an `Auto-Submitted` header or a no-reply sender in the thread.
6. **Deduplicate.** Repeated forwards and re-sends of the same text.

Steps 1 through 6 are plain text processing, no model involved. Expect them to remove the large majority of messages by count.

### Step 3: sample rather than analyze everything

Do not feed 22 years of mail to any model. After filtering, stratify by year and register and sample within strata, targeting a few hundred messages spread across the range rather than exhaustive coverage. Style analysis saturates quickly: the hundredth long email teaches far less than the first ten, and the goal is idiosyncrasy, not an average (see `VOICE.example.md` on capturing fingerprints rather than averaging).

Weight the sample toward:

- Long messages, which show sentence construction and paragraph shape
- Argumentative or explanatory messages, where register is most visible
- Work mail specifically, since that is the register the current guide is weakest on
- Spread across the full time range, to test whether the register actually is stable across 30 years

### Step 4: analyze

This is the only stage that needs a model, and it runs over a few hundred sampled messages rather than the whole archive.

Model choice, in order of preference:

- **Local Qwen via Ollama.** Nothing leaves the machine, which matters most here: this is two decades of personal mail, and the corpus will contain material that has nothing to do with writing style. No Ollama install was found during planning, so this needs setup first.
- **Haiku**, if local turns out impractical. Cheap enough for a few hundred messages, but the mail leaves the machine, so the filtering in step 2 has to be trusted.

Whatever runs it, the analysis should produce the sections `VOICE.example.md` already specifies: fingerprint features anchored in short real quotes, register-specific notes, and explicit conflicts with Personify's generic rules.

### Step 5: merge into VOICE.md

Merge rather than replace. `VOICE.md` v0.2's Feedback received section is real manager feedback and outranks anything derived from a corpus. The corpus work updates the fingerprint and the register notes, and adds a provenance section establishing the register's age.

Version the result v0.3 and note in Corpus what was sampled and what was not.

## Cost and sequencing notes

Do not estimate token cost before Takeout lands. Post-filter volume is the only input that matters, and it cannot be known until steps 1 and 2 have run. Filtering plus sampling is what makes this affordable; the raw archive size is nearly irrelevant to the final bill.

Sequencing: request Takeout first since it has the longest lead time, run filtering while waiting on nothing, then decide the model question once the post-filter word count is known.

## Privacy constraints

- `VOICE.md` is git-ignored and stays that way. It already contains a named manager and employer specifics.
- The corpus itself is never committed anywhere.
- Prefer local inference. If a hosted model is used, the filtering in step 2 is what limits exposure, so it runs first and gets verified before anything is sent.
- Political positions stay out of stored notes, matching the existing constraint in the Corpus section on ballot posts.

## What this does not change

The substance rules stand on their own regardless of what any corpus shows. Group Z, the funding test, and the task-board guidance address whether a reader can tell what work produced, which a 1996 Usenet post describing implementation instead of outcomes would have failed too. Only the style overrides (punctuation, sentence completeness) rest on premises this corpus would inform.
