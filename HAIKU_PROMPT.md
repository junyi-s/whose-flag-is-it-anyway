# Haiku Kickoff Prompt

Copy the block below and paste it as the first message to the Haiku agent in this project directory.

---

```
You are implementing "Whose Flag Is It Anyway?", a multiplayer party game. The working directory is ~/Development/projects/personal/whose-flag-is-it-anyway. The monorepo package scope is `@whose-flag/*`.

CRITICAL: Read these two files first, in this order:
1. ./IMPLEMENTATION_PLAN.md  — the architectural source of truth
2. ./TODO.md                  — the live progress tracker

OPERATING RULES (do not break these):

1. Work strictly phase-by-phase. Start with Phase 0 in TODO.md. Do not work ahead.
2. Update TODO.md before and after every task:
   - When you start a task, change its `[ ]` to `[~]` and update the "Last updated" / "Updated by" lines at the top.
   - When you finish a task, change `[~]` to `[x]`.
   - Only ONE task may be `[~]` at any time.
3. Use exact names from IMPLEMENTATION_PLAN.md sections 4, 5, and 10 for types, events, files, and directories. Do not rename anything.
4. Do not install dependencies that are not listed in IMPLEMENTATION_PLAN.md §2. If you think you need one, stop and ask.
5. Do not skip the acceptance checks at the end of each phase. Run them; if any fails, fix before continuing.
6. After completing a phase, commit with the message specified in TODO.md for that phase, then ask the user to review before starting the next phase.
7. If a task is ambiguous or you would have to make a design decision, STOP and ask the user. Mark the task `[!]` in TODO.md and add a `↳ blocker: <reason>` note. Do not guess.
8. No `any` types. Use `unknown` and narrow, or define a proper type.
9. Mobile-first: write Tailwind classes for mobile first, add `md:` / `lg:` for larger viewports.
10. Visual style is LOUD JACKBOX: chunky buttons with drop shadows, oversized type, springy/bouncy framer-motion animations, bold saturated colors, playful emoji-driven UI. Lean into motion and personality — this is a party game, not enterprise software.
11. Commit only at phase boundaries unless the user asks otherwise. Never use `--no-verify` or `--amend` without permission.
12. If you discover the plan is wrong, do not silently change implementation — surface the conflict to the user.
13. CONTEXT-AWARE CHECKPOINTING. Monitor your remaining context budget. If you detect you are getting close to the limit (e.g., you have used roughly 70%+ of context, the harness warns you about compaction, or you sense responses getting truncated):
    a. Do NOT start a new task. Finish writing the current file/edit cleanly if you are mid-edit; otherwise stop immediately.
    b. Mark the in-progress task `[!]` in TODO.md with `↳ blocker: context limit reached, see HANDOFF.md`.
    c. Write or overwrite `./HANDOFF.md` at the project root using the template below.
    d. If you have uncommitted work that builds cleanly, commit it as a WIP commit: `wip(phase-N): handoff at <task name>`. Do NOT force-push and do NOT use `--amend`.
    e. Send the user a final message stating: current phase, task that was in flight, the WIP commit SHA (if any), and the path to HANDOFF.md. Then STOP — do not attempt another tool call.

HANDOFF.md TEMPLATE:
```
# Handoff Note
Date: <YYYY-MM-DD HH:MM>
Reason: <context limit | manual pause | other>

## Current state
- Phase: <N — Title>
- Active task: <exact line copied from TODO.md>
- Task status: <not started | partially complete | complete-but-unverified>

## What was done in this session
- <bullet list of completed task lines from TODO.md>

## What was about to be done next
- <next task line>
- <approach already decided, if any>

## Files touched (uncommitted or just-committed)
- <path> — <one-line summary of change>

## WIP commit
- SHA: <abc123 | none>
- Builds clean: <yes | no | not run>

## Open questions / decisions pending
- <anything you would have asked the user about>

## Resume instructions for the next agent
1. Read IMPLEMENTATION_PLAN.md and TODO.md (as usual).
2. Read this HANDOFF.md.
3. Verify the WIP commit is on the current branch and the working tree matches expectations.
4. Resume the active task. Do NOT redo completed work.
```

START HERE:
- Read both .md files
- Confirm to me: (a) the current phase, (b) the first task you will start, (c) any open question from TODO.md "Pre-flight Decisions" that blocks you
- Wait for my go-ahead
- Then begin Phase 0
```

---

## Why this prompt is structured this way

- **Reads the plan first** — Haiku has limited context judgment, so we anchor it to the source of truth before any action.
- **Forces task-level granularity** — single `[~]` task at a time prevents drift.
- **Explicit rules around dependencies and types** — Haiku tends to invent these.
- **Mandatory checkpoint at every phase boundary** — you stay in the loop, can swap models, and Haiku doesn't run away.
- **"Stop and ask"** for ambiguity — cheaper to ask than to undo.
- **Visual style is restated in the prompt** — it would otherwise be buried in a section header.
- **Context-aware checkpointing (Rule 13)** — Haiku writes a `HANDOFF.md` and optional WIP commit before context runs out, so the next session (Haiku, Sonnet, or you) can resume without re-deriving state. This is the difference between losing 30 minutes of progress and resuming cleanly.

## Per-phase follow-up prompts

After Haiku finishes a phase and you've reviewed:

```
Phase N is approved. Proceed to Phase N+1.
- Reread the relevant section of IMPLEMENTATION_PLAN.md.
- Update TODO.md and begin the first task.
- Same operating rules apply.
```

## If Haiku goes off-track

```
Stop. Revert any uncommitted changes from this task. Re-read IMPLEMENTATION_PLAN.md §<section>. The mistake was: <describe>. Restart the task following the plan exactly.
```

## Resuming after a context-limit handoff

When you open a new session (Haiku or otherwise) to pick up where the last agent left off:

```
You are resuming work on "Whose Flag Is It Anyway?" The working directory is ~/Development/projects/personal/whose-flag-is-it-anyway.

Read these three files in this order, then summarize back to me where things stand BEFORE doing any work:
1. ./IMPLEMENTATION_PLAN.md  — architectural source of truth
2. ./TODO.md                  — live progress tracker (look for the `[~]` or `[!]` task)
3. ./HANDOFF.md               — the previous agent's handoff note

All operating rules from the original kickoff prompt still apply (including Rule 13 on context-aware checkpointing). Once I confirm your summary is correct, resume the active task.
```
