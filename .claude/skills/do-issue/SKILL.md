---
name: do-issue
description: Takes the next open item from issues-and-fixes-and-features.md, implements it on a new branch with tests, and opens a PR. One item per run.
argument-hint: "[words from a specific item, to pick it instead of the next one]"
disable-model-invocation: true
---

Work through ONE item from `issues-and-fixes-and-features.md` at the repo root. The user's lines are theirs: never reword, reorder or delete them. You only tick boxes and add `> agent:` notes.

## The file's format

```
- [ ] Concerts: remember the chosen time window after reload
- [ ] Bug: AI badge tooltip cut off on mobile
  > agent: Cut off at the right edge or the bottom? Suggested: "AI badge tooltip runs off the right edge on phones"
- [x] Concerts: filter by time window (branch concerts-window, PR #6)
```

- `- [ ]` is open, `- [x]` is done.
- An open item with a `> agent:` note under it is waiting for the user. Skip it. The user deletes the note when they have answered (usually by rewording the line).

## 1. Check before starting

Stop and tell the user if any of these fail:
- `git status --short` shows nothing except `issues-and-fixes-and-features.md` (it is gitignored, so normally nothing at all).
- `gh auth status` says logged in.
- `git switch main && git pull --ff-only` succeeds.

## 2. Pick the item

- With arguments (`$ARGUMENTS`): the open item whose text matches them.
- Otherwise: the first open item without a `> agent:` note.
- No item left: say so and stop.

## 3. Decide what to do with it

Read the code it concerns before deciding. Then exactly one of:

- **Already done:** change `[ ]` to `[x]` and append ` (already done: file:line)`. Stop.
- **Unclear, or too big for one small PR:** add a note on the next line, indented two spaces: `  > agent: <the question>. Suggested: "<a rewording you could act on>"`. For a big item, suggest how to split it into lines. Stop.
- **Clear:** continue.

## 4. Implement

- `git switch -c <short-kebab-name>` from main, e.g. `concerts-remember-window`.
- Make only the change the item asks for. No drive-by refactors; mention anything else you noticed in the PR description instead.
- Match the surrounding code: naming, comment style, file layout (components in component files, logic in plain `.ts` files so it can be tested).

## 5. Test

- Run the `test-writer` agent on the uncommitted changes.
- Then `npm run typecheck`, `npm test` and `npm run test:e2e`. All must pass. If you can't get them green, stop: leave the branch as it is, and report what fails.
- If the test-writer reports a bug in existing code that the item didn't ask about, don't fix it. Put it in the PR description, and suggest a new line for the file in your report.

## 6. Open the PR

Running `/do-issue` is the user's go-ahead to push this one branch and open its PR. Never merge it: the user reviews and merges.

- Commit with a message that says what changed and why.
- `git push -u origin <branch>`
- `gh pr create --base main` with:
  - **Title:** the item, tidied into a PR title.
  - **Body:** the item line quoted; what changed and why (a few bullets); how it was tested (the tests added, plus anything to check by hand, e.g. in the browser); anything noticed but left alone.
- Tick the item: `- [x] <the user's text unchanged> (branch <branch>, PR #<number>)`.

## 7. Report

A few lines: the item, the PR link, what changed, what the user should check by hand, and the next open item.
