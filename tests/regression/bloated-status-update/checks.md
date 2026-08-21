# Checks: bloated status update

Mark each pass or fail. A fail is a regression unless the commit that caused
it says otherwise.

## Group V (too many words for a simple concept)

- [ ] Output is under 80 words. The input is roughly 200 and carries maybe
      three ideas.
- [ ] "an analysis of the existing implementation" became a verb, not a
      shorter noun phrase. "I looked at" or "I found," not "after analysis."
- [ ] "a determination was made that" is gone entirely.
- [ ] "may potentially" collapsed to at most one hedge.
- [ ] "it should be noted that" is gone.
- [ ] "in order to" is gone or became "to."
- [ ] The update-about-an-update opener ("I wanted to circulate a brief
      update on where things currently stand") is gone. The output starts
      with the finding.
- [ ] The sign-off ("please don't hesitate to reach out") is gone.

## Group W (impersonal framing)

- [ ] A person appears as the subject of the finding. "I found," not "it was
      determined" or "analysis showed."
- [ ] "A fix has been implemented" names who did it, or at minimum becomes
      "fixed in #813."
- [ ] "have been observed" names an observer or is rewritten so the actor is
      not hidden.

## Group Z (implementation instead of outcome)

- [ ] The second paragraph's component inventory (indexer module, queue
      consumer, dead-letter path, metrics) does NOT survive as a shorter
      list of components. This is the check that catches a Z regression:
      compressing the list is not fixing it.
- [ ] The output states what is now true that was not true before, in terms
      a person funding the work could evaluate. Something like "search
      reindexes without the staging slowdown."
- [ ] "follow the same layout that two other services already use" is cut.
      It is reviewer reassurance, not an outcome.

## Facts that must survive (Process step 3)

- [ ] PR number #813.
- [ ] The caveat that only the read path was validated.
- [ ] That more work remains.
- [ ] The cause: the incremental reindex path.

## Anti-over-correction

- [ ] The result is not parataxis: not three or more bare declaratives in a
      row with no connective tissue (group X).
- [ ] The result is blunt but not curt. No implied hostility.
