# The category workbook: building it, and the one step that is not in the file

`node tools/make-category-workbook.mjs` writes two files into `../Deliverables`: the template
with the Categories column empty, and the same thing filled with our provisional readings.

## The one manual step, and the thing that blocks it

**Turn on multiple selections, once per domain tab, after converting to Google Sheets.**

`Allow multiple selections` is a Google Sheets setting on a dropdown rule. The xlsx format has
no equivalent, so `openpyxl` cannot write it and the conversion cannot invent it.

**The checkbox arrives greyed out, and the reason is not the one you will guess.** It is not the
range, and it is not the criteria: it is **Display style**. An imported rule comes across as
`Arrow`, which is the old dropdown look, and a cell drawn that way holds one value by
definition. Multi-select needs **Chip**. Choose Chip and the checkbox enables immediately.

On each of the four domain tabs:

1. Click into the Categories column, then **Data → Data validation**.
2. Click the rule whose range starts with `D`.
3. Open **Advanced options**.
4. Under *Display style*, choose **Chip**.
5. **Allow multiple selections** is now enabled. Tick it.
6. **Done**.

*If the data is invalid* should read **Reject the input**; the generator now writes that, so it
comes across on its own.

When it has worked, the cells show rounded chips with a dropdown arrow rather than a bare
arrow at the right edge of the cell.

## The two shapes this went through, so nobody tries them again

**Combinations as whole entries in one list** — `Security, Privacy` as a single choice. A
validation list is itself comma separated, so Sheets split those entries on their own commas
and showed five choices instead of eleven. There is no escaping that works.

**Three columns sharing one list**, headed `Also about`, `and`, `and`. It functioned and read
terribly, and it existed only because of a claim that a spreadsheet has no multi-select
dropdown. Google Sheets has one.

## What the sheets carry

| Column | What it is |
|---|---|
| `#`, `Q#`, `Assessment Question` | Dan's, unchanged |
| `Categories` | the five that are not domains, multi-select. A question's own domain is the tab it is on and is never typed |
| `Answer type` | `Scale 0-10` or `Yes / No`. Ours and provisional: ten of the 176 read as binary, which Dan named himself |
| `Answer` | the picker matching that row's type: `0`–`10` and `N/A`, or `Yes`, `No`, `N/A` |
| `Maturity Label`, `Notes / Evidence` | Dan's, unchanged |

`Assessment Scale` and `Summary Dashboard` are Dan's own tabs, passed through whole. The scale
carries his colours, which are the workbook's colour system: Black at 0 through Purple at 10.
The dashboard calculates nothing here and says so on itself.

## A trap in the conversion

A data validation applied to **many separate single cells** survives the xlsx to Sheets
conversion, but it is easy to believe it has not: the rule is there in **Data → Data
validation**, listed by its range. The yes-or-no picker sits on ten rows out of 176, so clicking
almost any cell in the Answer column shows the 0-to-10 list, correctly. To see the other one,
click `Business Architecture!H58`, which is B-Q50.

## Reading it back

`node tools/import-rubric.mjs` finds the category column by its header, so it can sit anywhere
in the sheet, and it accepts `Categories`, `Topics`, `Category`, and the older `Also about` /
`and` spellings. A name that is not one of the nine refuses the whole import and says which
question it was in.
