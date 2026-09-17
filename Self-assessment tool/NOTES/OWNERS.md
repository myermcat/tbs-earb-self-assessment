# Who owns what, this week

One line each. Update it when it changes. This is the file, not a chat message, because a
chat message is gone by Thursday and the person who joins in October will read this.

A **seam** is a piece of the tool that can be finished by one person without waiting for
anybody. They are chosen so two people are rarely in the same file on the same day.

| Seam | What it covers | Owner |
|---|---|---|
| Rubric and import | `rubric/`, `tools/import-rubric.mjs`, the topics and domains, Dan's workbook | Mariia |
| Store and access | `src/store.ts`, `src/firebase.ts`, `src/signer.ts`, `deploy/firestore.rules` | Mariia |
| Questionnaire | `src/views-submit.ts`, `src/views-results.ts`, scoring and flags | |
| Assessor and admin | `src/views-review.ts`, `src/views-dashboard.ts`, the audit | |
| Requirements and risks | `NOTES/requirements.data.mjs`, the risk register | Mariia |

## How two sessions work on this without stepping on each other

**These rules exist because they were broken.** Two sessions worked this repository on `main` at
the same time. One commit swept up the other session's half-finished work. Another went out with
the suite red, because the suite was run, code was edited afterwards, and the push happened
without running it again. Nothing was published, because `deploy/publish-preview.sh` runs the
suite before it builds, but that is a backstop and not a process.

Sessions are often both the same person driving two Claude windows. That makes the rules more
necessary rather than less: neither window remembers what the other did.

**1. Branch. `main` only through a pull request.** The branch is named for the seam:
`assessor/ready-column`, not `fix-2`. Branch protection on `main` refuses force pushes and
deletions and requires the `test` check.

**2. `git pull --rebase` before the first commit of a sitting.** Not just at the start of the
day. The other session may have pushed while you were reading.

**3. Say which seam you are in before you start.** Update the table above, in a commit. Not in
chat: chat is gone by Thursday and the person who joins in October reads this file.

**4. `npm test` immediately before every push, not before the last edit.** If you change
anything after running it, run it again. This is the one that was broken.

**5. Commit as often as you like, push at the end of your sitting.** If two sessions are on
different days, rules 1 to 4 are already enough on their own.

**6. Decisions go in `NOTES/requirements.data.mjs` the day they are made.** Not in a commit
message, not in chat. That file is how two people hold the same picture of what this is.

**7. Do not commit build output.** `dist/` is ignored, and it stays ignored: two sessions
rebuilding one file is a conflict on every commit, and `publish-preview.sh` builds it fresh.

### What to do when you have collided anyway

Rebase, do not merge, and do not force. `git pull --rebase`, fix the conflict, run `npm test`,
push. If the suite is red after a rebase it is usually a test the other session wrote against
behaviour you changed: read their test before changing it, because it is describing a decision.

### Publishing

Only from `main`, only green, and `bash deploy/publish-preview.sh` runs the suite itself and
refuses to publish if it fails. Publishing from a branch puts half a feature in front of TBS.

