Target shape, not a string to diff against:

> I found the staging latency regression: the incremental reindex path was
> the cause, fixed in #813. there might be more edge cases since I only
> validated the read path. search now reindexes without the staging slowdown,
> and bad documents land in a dead-letter queue instead of stalling the
> consumer. still more to do on the remaining items.

Roughly 55 words against the original's 200, with every fact intact.
