# Delegation

Applies only when the `delegate` tool is available.

- Exploration: expecting more than about three search or read commands in code
  not yet seen this session → spawn `recon` first, and continue with work that
  does not depend on it.
- Implementation: once scope and acceptance criteria are set, default to
  spawning `implement` when the change spans two or more files or has a
  separable part with its own tests. Edit directly when the change is trivial,
  mechanical or tightly coupled, or touches one file with no such
  separable part.
- Independent parts → parallel children with disjoint files.
- Saved parent context counts as a benefit even when wall time is equal.
- Before the first edit of a multi-file change, state in one line whether you
  delegate or edit directly, and why.
