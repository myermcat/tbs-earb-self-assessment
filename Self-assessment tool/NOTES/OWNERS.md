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

## How two people work on this without stepping on each other

**Branch, then pull request.** Nobody pushes to `main`. The branch is named for the seam:
`assessor/ready-column`, not `fix-2`.

**Commit as often as you like, push at the end of your day.** If two people are working on
different days this is enough on its own: the day starts with `git pull`, so you start from
what the other person finished.

**If you are both working the same day, say which seam you are in before you start.** One
line in chat. It costs ten seconds and it is the whole of the coordination problem.

**The test suite is the referee.** `npm test` before every push, and CI runs it again on the
pull request. Nobody has to ask permission to change something; the suite says whether it
broke.

**Decisions go in `NOTES/requirements.data.mjs` the day they are made.** Not in a commit
message, not in chat. That file is how two people hold the same picture of what this is.
