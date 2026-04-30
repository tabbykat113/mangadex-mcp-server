# AGENTS.md — Development Philosophy & Agent Coordination

This repository is designed for **multi-agent collaboration**. Independent agents may spawn, work, and exit without shared memory. The only persistent coordination layer is the filesystem — specifically, documentation.

## Core Principle

**If it's not written down, it doesn't exist.**

Every design decision, architectural choice, discovered quirk, and workflow convention must be captured in a markdown file. Agents arriving in a fresh session have zero context beyond what's in these files. Write eagerly. Write often.

## Documentation Strategy

### The Hierarchy

| File | Purpose | Update Frequency |
|------|---------|------------------|
| `README.md` | Project entry point, status, quick links | On major milestones |
| `AGENTS.md` | This file — philosophy, conventions, coordination rules | When conventions evolve |
| `docs/specification.md` | Technical specification | When scope changes |
| `docs/research.md` | API research, design notes, discovered quirks | During research, continuously |
| `docs/decisions/*.md` | Architectural Decision Records (ADRs) | Per significant decision |
| `docs/progress.md` | Current work log, blockers, next steps | Daily or per-session |

### ADR Format (lightweight)

Use `docs/decisions/YYYY-MM-DD-title.md`:

```markdown
# Decision: Short Title

**Date:** 2026-04-30
**Context:** What problem were we solving?
**Decision:** What did we choose?
**Rationale:** Why? What alternatives were rejected?
**Consequences:** What does this commit us to?
```

### Progress Log

`docs/progress.md` is the **session handoff file**. When an agent finishes work, it updates this file with:

- What was completed
- What was started but not finished
- Blockers or open questions
- What the next agent should pick up

Example:
```markdown
## 2026-04-30 — Kimi
- [x] Created v1.0 spec with 4 core tools
- [ ] Implementation not started
- [ ] Need to decide: zod version (3.25 vs 3.24?)

## Next Up
- Scaffold project structure (src/, tests/)
- Set up TypeScript + ESM configuration
```

## Agent Behavior Rules

### Read Before Write
1. Read `AGENTS.md` first
2. Read `docs/progress.md` second
3. Read relevant specs/research before proposing changes
4. Check `git log` to understand recent work

### Write Before Exit
1. Update `docs/progress.md` with what you did and what's next
2. If you made a design decision, write an ADR
3. If you discovered something non-obvious, add it to `docs/research.md`
4. If you changed a convention, update `AGENTS.md`

### Low Trust, High Verification
- Don't assume another agent did something correctly. Verify if it matters.
- If you find a bug an agent left behind, document the fix *and* the cause in `docs/progress.md`
- If specs and code disagree, trust the spec and open a discussion — or fix the code and update the spec

### One Session Per Workflow
Each independent workflow (scaffolding, implementation, testing, documentation) gets its own agent session. Don't mix unrelated work in one long session — memory compaction will eat the details.

### Session Continuation (Kimi Code)
Kimi Code (`kimi-cli`) allows `--continue` to extend a session. When continuing:
- The agent remembers previous context (stateful)
- **But:** trust this memory lightly. Compaction is imperfect and reasoning errors compound
- Repeat only critical constraints (e.g., "never push to main", "auth tokens must not touch disk")
- For long-running work, prefer fresh sessions with explicit context from docs over continued sessions with stale memory

## Communication Style

- **No sound-right confirmations.** Silent approval is enough for non-critical matters. Speak up when something is wrong.
- **Status updates while working.** If work takes more than a few seconds, send a "starting X" or "hit a problem: Y" message.
- **Summaries when done** are fine, but don't let humans wait in silence wondering if you're working or stuck.

## Red Lines

- Never push code changes to remote without a Pull Request
- Never persist auth tokens or credentials to disk
- Never run destructive commands without explicit approval
- `trash` > `rm` (recoverable beats gone forever)

## Related

- `docs/specification.md` — Technical spec
- `docs/research.md` — API research
- `docs/progress.md` — Current work log
- `docs/decisions/` — Architectural Decision Records
