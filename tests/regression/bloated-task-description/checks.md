# Checks: bloated task title and description

This is the case that exercises the long-form loophole. Run it twice: once as
written (a ticket, work register), and once recast as a roughly 1000-word
design doc in the same padded register, which is what actually reaches
classification step 3. The V, W, and Z checks below must pass **identically
both times**. See notes.md for why padding the ticket itself does not reach
step 3.

## Group Z (implementation instead of outcome): primary

- [ ] The title is no longer a topic label. "Data pipeline work" names an area,
      not an end state.
- [ ] The title states something that is true when the work is done, and a
      person funding it could tell why it mattered.
- [ ] The body leads with the capability gained, not with the component
      inventory.
- [ ] The component list (staging bucket writer, flat-file index, container
      deployment, monitoring hooks) is demoted to at most one clause, or cut.
      A shorter list of components is NOT a pass.
- [ ] "follows the same general layout that two other services already employ"
      is cut. It is reviewer reassurance, not an outcome.
- [ ] Apply the hard test from group Z directly: shown to the person paying
      for the work, could they tell why it was worth paying for? Answer yes
      or no, and if no, the case fails regardless of the other checks.

## Group V (too many words): primary

- [ ] Output is well under half the input's length.
- [ ] "encompasses the implementation of" became a verb.
- [ ] "the determination was made that" is gone.
- [ ] "it should be noted that" is gone.
- [ ] "with regard to" became "about" or is gone.
- [ ] "at this point in time" became "now" or is gone.
- [ ] "there are several considerations that will need to be taken into
      account" is gone or collapsed to a plain statement of the open question.
- [ ] "utilized" became "used" or the clause is rewritten.

## Group W (impersonal framing): primary

- [ ] "a determination was made" names who decided, or becomes "we decided."
- [ ] "was not utilized" gets an actor, or is rewritten so none is hidden.
- [ ] The open question is owned in the first person: "I don't know yet,"
      not "the specifics have yet to be fully determined."

## Facts that must survive (Process step 3)

- [ ] No managed database, deliberately, because this is trial-scoped.
- [ ] Flat-file index.
- [ ] Container deployment.
- [ ] Monitoring exists.
- [ ] Later phases are undecided. This must survive as an admitted unknown,
      not be dropped and not be inflated into a roadmap claim.

## Anti-over-correction

- [ ] Nothing invented. No claim about which partner, which volume, or what
      the next phase is. The input does not say, so the output must not.
- [ ] Not parataxis (group X).
