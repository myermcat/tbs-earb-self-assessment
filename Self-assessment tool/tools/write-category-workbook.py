#!/usr/bin/env python3
"""
Writes the workbook. Called by tools/make-category-workbook.mjs, which does the reading.

Split in two because the reading has to stay in step with the importer and is written in the
same language and the same shapes as it. The writing is Excel mechanics, and Excel mechanics
live in openpyxl.

WHOSE COLOURS THESE ARE

Dan's. His Assessment Scale tab names a colour for every score from 0 to 10, Black through
Purple, and that is the colour system this workbook uses. An earlier version of this file
invented a colour per domain, which was inventing something the workbook already had an answer
for. The scale comes across whole, with its colours applied to its own rows, and the question
sheets stay plain so that nothing competes with it.

ONE COLUMN, ONE PICKER

The categories go in a single Categories column with a dropdown, which is what was asked for.
Five categories have 31 possible combinations and the ones a question actually needs are few,
so the list holds the ten that anybody has a reason to want. It warns rather than refuses, so a
combination nobody anticipated can still be typed, and nothing is lost by that: the importer
checks every name and refuses the whole file, naming the question, if one is not recognised.
"""
import json
import sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

INK = '1A1A1A'
MUTED = '6B6B6B'
LINE = 'D9D9D9'
BAND = 'F2F4F7'
HEAD = '31445C'          # one neutral, used for every question sheet's header
PICK_BG = 'FFF6DC'       # the one column anybody has to fill in

# Dan's own names for the eleven score colours, on his Assessment Scale tab, given hexes.
SCALE_COLOURS = {
    'Black': ('1A1A1A', 'FFFFFF'),
    'Dark Red': ('8B1A1A', 'FFFFFF'),
    'Red': ('C0392B', 'FFFFFF'),
    'Orange': ('D35400', 'FFFFFF'),
    'Orange-Yellow': ('E08E0B', '1A1A1A'),
    'Yellow': ('F1C40F', '1A1A1A'),
    'Yellow-Green': ('A9C23F', '1A1A1A'),
    'Green': ('27923E', 'FFFFFF'),
    'Dark Green': ('16713A', 'FFFFFF'),
    'Blue': ('1F6FB2', 'FFFFFF'),
    'Purple': ('7A4E9E', 'FFFFFF'),
}

payload = json.load(open(sys.argv[1]))
ASKED = payload['asked']
PICKS = payload['picks']
FILLED = payload['filled']

# #, Q#, Assessment Question, Categories, Score, Maturity Label, Notes / Evidence
CAT_COL = 4
TYPE_COL = 5
ANSWER_COL = 6
HEADERS = ['#', 'Q#', 'Assessment Question', 'Categories', 'Answer type',
           'Answer', 'Maturity Label', 'Notes / Evidence']

# Ten questions out of 176 read as yes or no rather than as a maturity, and Dan named that
# defect himself. One Answer column, with the right picker on each row: a scale question offers
# 0 to 10, a yes-or-no question offers Yes and No, and both offer N/A. Two columns would leave
# an empty cell on every row and make the reader work out which one to look at.
SCALE_PICK = [str(n) for n in range(11)] + ['N/A']
YESNO_PICK = ['Yes', 'No', 'N/A']

thin = Side(style='thin', color=LINE)
box = Border(left=thin, right=thin, top=thin, bottom=thin)
wrap_top = Alignment(wrap_text=True, vertical='top')
centre = Alignment(horizontal='center', vertical='center')

wb = Workbook()
wb.remove(wb.active)


def read_me():
    """The first tab, because a workbook that needs explaining should explain itself."""
    ws = wb.create_sheet('Read me first')
    ws.sheet_view.showGridLines = False
    ws.column_dimensions['A'].width = 3
    ws.column_dimensions['B'].width = 104

    # An explicit counter, because ws.append([]) on an empty list does not advance the cursor:
    # every line landed on row 1 and overwrote the one before it, and the tab shipped holding
    # only its last paragraph.
    state = {'r': 1}

    def line(text='', size=11, bold=False, colour=INK):
        r = state['r']
        state['r'] += 1
        if not text:
            ws.row_dimensions[r].height = 8
            return
        c = ws.cell(row=r, column=2, value=text)
        c.font = Font(name='Calibri', size=size, bold=bold, color=colour)
        c.alignment = Alignment(wrap_text=True, vertical='top')
        # Wrapped text needs a row tall enough to show it, and openpyxl does not measure.
        ws.row_dimensions[r].height = max(size * 1.6, 15 * (1 + len(text) // 100))

    line('GC EA assessment tool — categories', 18, True)
    line('Filled in as an example. Every entry below came from a keyword pass over the question '
         'wording and is ours, not yours.' if FILLED
         else 'A template. The Categories column is empty and waiting for you.',
         11, False, MUTED)
    line()
    line('The one thing we are asking for', 14, True)
    line('Every question already belongs to one domain: the tab it is on. That never changes and '
         'you never type it.')
    line('Some questions are also about something else. A question about encrypting a data store '
         'is a Data question and it is also about Security. A question about lifecycle cost is a '
         'Business question and it is also about Financial. Those extra subjects are the '
         'categories, and the Categories column is where they go.')
    line()
    line('How to fill it in', 14, True)
    line('1.  Click a cell in the Categories column. A dropdown appears.')
    line('2.  Choose the entry that matches. The list holds each category on its own and the '
         'combinations anybody is likely to need.')
    line('3.  Leave it empty when the question is only about its own domain. That is the normal '
         'case: about three quarters of them.')
    line()
    line('If you need a combination the list does not hold, type it, separated by commas. The '
         'tool checks every name when it reads this file and refuses the whole import if one is '
         'not recognised, naming the question it was in. A category nobody recognises would '
         'otherwise score nothing, on every screen, and never be noticed.')
    line()
    line('The nine categories', 14, True)
    line('Four are the domains themselves, filled in by the tab a question is on: Business, Data, '
         'Application, Technology.')
    line('Five are what the Categories column asks for: Security, Privacy, Financial, '
         'Accessibility, Official Languages.')
    line()
    line('A question can carry as many as apply. It still counts once in the overall score, '
         'through its domain, and at full weight inside every category it carries. So the '
         'category scores do not add up to the overall, and the tool says so.')
    line()
    line('Never duplicate a question onto a second tab', 14, True, 'B03A2E')
    line('A question that appears on two tabs is counted twice in the overall score, and the '
         'department’s number moves because of how we filed a question. One question, one '
         'tab, as many categories as apply.')
    line()
    line('Two categories rest on very little', 14, True)
    line('Accessibility is asked about by three questions and Official Languages by two. That is '
         'thin, and it is worth knowing before anybody reads a score for either: a number built '
         'on two questions moves a long way on one answer. If there should be more, that is a gap '
         'in the instrument and not in this column.')
    line()
    line('An earlier version of this workbook said both were empty. That was wrong. Six questions '
         'mention something "accessible" and three of them are about accessibility; the other '
         'three are the FAIR principles\u2019 Accessible and data reaching other departments, '
         'which is a different sense of the word.')
    line()
    line('The Answer type column', 14, True)
    line('Ten of the 176 questions read as yes or no rather than as a maturity, which you named '
         'yourself. The Answer type column says which we think each one is, and the Answer column '
         'beside it offers the matching picker: 0 to 10 for a scale question, Yes and No for the '
         'others, and N/A on both. Our reading is provisional; change the type and the picker '
         'follows.')


def domain_sheet(d):
    ws = wb.create_sheet(d['label'][:31])
    ws.sheet_view.showGridLines = False

    for i, w in enumerate([5, 6, 62, 28, 13, 11, 16, 32], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    last = len(HEADERS)

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=last)
    title = ws.cell(row=1, column=1,
                    value=f"{d['label']}  ·  {d['tagline']}" if d['tagline'] else d['label'])
    title.font = Font(name='Calibri', size=15, bold=True, color='FFFFFF')
    title.fill = PatternFill('solid', fgColor=HEAD)
    title.alignment = Alignment(vertical='center', indent=1)
    ws.row_dimensions[1].height = 30

    # Written before the merge: openpyxl makes every cell but the first read-only once merged.
    sub = ws.cell(row=2, column=1, value='   ' + d['weight'])
    sub.font = Font(name='Calibri', size=10, color=MUTED)
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=last)

    for i, h in enumerate(HEADERS, start=1):
        c = ws.cell(row=3, column=i, value=h)
        c.font = Font(name='Calibri', size=10, bold=True, color='FFFFFF')
        c.fill = PatternFill('solid', fgColor=HEAD)
        c.alignment = Alignment(wrap_text=True, vertical='bottom',
                                horizontal='center' if i >= CAT_COL else 'left')
        c.border = box
    ws.row_dimensions[3].height = 30
    ws.freeze_panes = 'D4'

    r = 4
    scale_rows, yesno_rows = [], []
    for row in d['rows']:
        if row['kind'] == 'section':
            ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=last)
            c = ws.cell(row=r, column=1, value=row['text'])
            c.font = Font(name='Calibri', size=11, bold=True, color=HEAD)
            c.fill = PatternFill('solid', fgColor=BAND)
            c.alignment = Alignment(vertical='center', indent=1)
            ws.row_dimensions[r].height = 24
            r += 1
            continue

        ws.cell(row=r, column=1, value=row['num']).alignment = centre
        ws.cell(row=r, column=2, value=row['q']).alignment = centre
        q = ws.cell(row=r, column=3, value=row['text'])
        q.alignment = wrap_top
        q.font = Font(name='Calibri', size=10.5)

        # The two columns anybody has to fill in, tinted so it is obvious which ones they are.
        cat = ws.cell(row=r, column=CAT_COL, value=row['categories'] or None)
        cat.alignment = Alignment(vertical='center', horizontal='center', wrap_text=True)
        cat.font = Font(name='Calibri', size=10, bold=bool(row['categories']), color=HEAD)
        cat.fill = PatternFill('solid', fgColor=PICK_BG)

        kind = ws.cell(row=r, column=TYPE_COL, value=row['answerType'])
        kind.alignment = centre
        kind.font = Font(name='Calibri', size=10, color=HEAD,
                         bold=row['answerType'].startswith('Yes'))
        kind.fill = PatternFill('solid', fgColor=PICK_BG)
        (yesno_rows if row['answerType'].startswith('Yes') else scale_rows).append(r)

        for i in range(1, last + 1):
            ws.cell(row=r, column=i).border = box
        r += 1

    def picker(values, cells, prompt, title):
        if not cells:
            return
        dv = DataValidation(type='list', formula1='"%s"' % ','.join(values).replace('"', ''),
                            allow_blank=True, showErrorMessage=False)
        dv.prompt = prompt
        dv.promptTitle = title
        ws.add_data_validation(dv)
        for c in cells:
            dv.add(c)

    col = get_column_letter(CAT_COL)
    picker(PICKS, [f'{col}4:{col}{r - 1}'],
           'Pick the subjects this question is also about, beyond its own domain. '
           'Leave it empty when there are none.', 'What else is it about?')

    tcol = get_column_letter(TYPE_COL)
    picker(['Scale 0-10', 'Yes / No'], [f'{tcol}4:{tcol}{r - 1}'],
           'How this question is answered. Ours, and provisional: change it if it reads wrong.',
           'Scale or yes-or-no?')

    # The Answer column gets whichever picker matches the row, so the sheet asks the right
    # question on every line.
    acol = get_column_letter(ANSWER_COL)
    picker(SCALE_PICK, [f'{acol}{n}' for n in scale_rows],
           'A maturity score from 0 to 10, or N/A when the question does not apply.', 'Score')
    picker(YESNO_PICK, [f'{acol}{n}' for n in yesno_rows],
           'Yes or no, or N/A when the question does not apply.', 'Yes or no')
    return ws


def scale_sheet(rows):
    """Dan's score ladder, with his colours on it. Nothing here is ours."""
    ws = wb.create_sheet('Assessment Scale')
    ws.sheet_view.showGridLines = False
    for i, w in enumerate([8, 16, 22, 92], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=4)
    t = ws.cell(row=1, column=1, value=rows[0][0] if rows else 'Assessment Scale')
    t.font = Font(name='Calibri', size=15, bold=True, color='FFFFFF')
    t.fill = PatternFill('solid', fgColor=HEAD)
    t.alignment = Alignment(vertical='center', indent=1)
    ws.row_dimensions[1].height = 30

    for i, h in enumerate(rows[1][:4] if len(rows) > 1 else [], start=1):
        c = ws.cell(row=2, column=i, value=h)
        c.font = Font(name='Calibri', size=10, bold=True, color='FFFFFF')
        c.fill = PatternFill('solid', fgColor=HEAD)
        c.border = box

    r = 3
    for row in rows[2:]:
        if not any(row):
            continue
        for i, v in enumerate(row[:4], start=1):
            c = ws.cell(row=r, column=i, value=v or None)
            c.alignment = wrap_top if i == 4 else centre
            c.font = Font(name='Calibri', size=10.5)
            c.border = box
        name = row[1] if len(row) > 1 else ''
        if name in SCALE_COLOURS:
            bg, fg = SCALE_COLOURS[name]
            for i in (1, 2, 3):
                cell = ws.cell(row=r, column=i)
                cell.fill = PatternFill('solid', fgColor=bg)
                cell.font = Font(name='Calibri', size=10.5, bold=True, color=fg)
        r += 1
    return ws


def plain_sheet(title, rows, widths):
    ws = wb.create_sheet(title)
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    r = 1
    for row in rows:
        if not any(row):
            r += 1
            continue
        for i, v in enumerate(row[:len(widths)], start=1):
            c = ws.cell(row=r, column=i, value=v or None)
            c.alignment = wrap_top
            c.font = Font(name='Calibri', size=10.5,
                          bold=(r <= 2 or 'OVERALL' in (row[0] or '')))
            # Borders, because a sheet with gridlines off and nothing drawn reads as a blank
            # white page with text floating on it, which is what the first version looked like.
            if r > 2:
                c.border = box
        if r == 1:
            ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(widths))
            h = ws.cell(row=1, column=1)
            h.font = Font(name='Calibri', size=15, bold=True, color='FFFFFF')
            h.fill = PatternFill('solid', fgColor=HEAD)
            h.alignment = Alignment(vertical='center', indent=1)
            ws.row_dimensions[1].height = 30
        r += 1
    return ws


read_me()
for d in payload['sheets']:
    domain_sheet(d)
scale_sheet(payload['scale'])
plain_sheet('Summary Dashboard', payload['dashboard'], [46, 14, 20, 34])

wb.save(payload['out'])
total = sum(s['questions'] for s in payload['sheets'])
done = sum(1 for s in payload['sheets'] for row in s['rows']
           if row['kind'] == 'question' and row['categories'])
print(payload['out'].split('/')[-1])
print(f"  {len(wb.sheetnames)} tabs, {total} questions, one Categories picker with "
      f"{len(PICKS)} entries" + (f", {done} rows pre-filled" if FILLED else ", all empty"))
