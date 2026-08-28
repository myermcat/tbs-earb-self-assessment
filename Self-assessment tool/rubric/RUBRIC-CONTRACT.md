# What a rubric file has to contain

The app renders whatever rubric it is handed. This is the contract it validates against;
anything failing it is refused with a list of problems, rather than half-loaded.

## Top level

| Field | Required | Notes |
|---|---|---|
| `fileType` | yes | Must be `"gc-arch-rubric"`. |
| `formatVersion` | yes | Must be `1`. |
| `id` | yes | Stable across versions, e.g. `gc-arch-assessment`. |
| `version` | yes | Bump on every content change. Recorded in every assessment. |
| `status` | yes | `stand-in` / `draft` / `approved`. Anything but `approved` shows a warning banner. |
| `title` | yes | Shown in the header and used as the page title. |
| `provenance` | no | Where the content came from. Shown to users when status is `stand-in`. |
| `dlgBaseUrl` | no | Base URL of the Digital Lifecycle Guide on GCXchange. Empty means stage links render as plain text. |
| `scale` | yes | `{min, max, anchors[]}`. The shared ladder. |
| `bands` | yes | At least one. Sorted by `min` descending at runtime. |
| `stageMultipliers` | yes | `{"low-ok": n, "expected": n, "critical": n}`. |
| `lifecycleStages` | yes | At least one. |
| `domains` | yes | At least one. |

## Anchors

```json
{ "value": 3, "label": "Informal. It lives in someone's head. Nothing we could hand you." }
```

The ladder is shown to the submitter, and the rung above their score is what the results
page offers as "to reach 5 you would need". So write the labels as descriptions of a state,
not as adjectives. `"Partial"` is useless; `"Documented but out of date"` is not.

## Bands

```json
{ "id": "hallpass", "min": 6.0, "label": "Hall pass",
  "routing": "Suggested: no GC EARB appearance required.", "tone": "good" }
```

`tone` is `good` / `neutral` / `bad` and only drives colour. A band matches when the overall
score is at or above its `min`; the highest matching band wins.

## Domains, categories, questions

Domains carry a `weight`. They do not have to sum to 100 - the roll-up normalises - but
keeping them at 100 makes the numbers readable.

```json
{
  "id": "TA2",
  "text": "Is there a clear inventory of all infrastructure components...",
  "help": "Shown under the question in smaller type.",
  "weight": 10,
  "evidencePrompt": "A CMDB extract, an asset inventory, a patch compliance report.",
  "anchors": [ ... ],
  "picklist": [ { "value": "saas", "label": "Software as a service, vendor hosted" } ],
  "picklistNote": "Shown as a caveat under the dropdown.",
  "stageExpectation": { "discovery": "low-ok", "maturity": "critical" },
  "nextSteps": ["Build the inventory.", "Assign an owner to each out-of-support component."]
}
```

- `id` must be unique across the whole rubric. It appears in the CSV column names, so
  changing an id breaks comparison with older exports. Add rather than rename.
- `anchors` overrides the shared scale for that one question. Omit to use the shared ladder.
- `picklist` including an option with `value: "other"` gives the submitter a free-text box,
  and every "other" answer is flagged for you - which is how you find the option your list
  is missing.
- `stageExpectation` only needs the stages that differ from `expected`.
- `nextSteps` are shown to low scorers as their backlog. Write them as actions, not advice.

## Adding or changing questions later

Expected, and the reason the rubric is a separate file.

- **Adding a question** - safe. Old assessments simply have no answer for it, which shows as
  incomplete if reopened.
- **Rewording a question** - safe, same id, bump `version`.
- **Changing a weight or a band** - safe, but old scores were computed under the old numbers.
  The app recalculates on load and warns when an assessment's rubric version differs.
- **Removing a question** - the old answer is carried in the file but ignored. Nothing breaks.
- **Renaming an id** - avoid. It orphans the old answer and breaks CSV comparison.
