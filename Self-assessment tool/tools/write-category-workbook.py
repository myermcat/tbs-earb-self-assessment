#!/usr/bin/env python3
"""
Writes the workbook. Called by tools/make-category-workbook.mjs, which does the reading.

Split in two because the reading is the part that has to stay in step with the importer, and
it is written in the same language and the same shapes as the importer. The writing is Excel
mechanics, and Excel mechanics live in openpyxl.

WHAT THIS IS CAREFUL ABOUT

A tick column with free typing in it is a tick column that will contain "X", "yes", "Y" and
"1 " by the third department. Every one of them gets a dropdown that offers exactly one value,
so the only two states a cell can be in are ticked and empty.

The Topics column is a formula and is locked out of the way on the right. Nobody edits it,
nothing can be mistyped into it, and it produces exactly the comma-separated form the importer
reads. Two things that have to agree cannot disagree if only one of them is ever written.
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
BAND = 'F5F7F9'

payload = json.load(open(sys.argv[1]))
ASKED = payload['asked']
FILLED = payload['filled']

# #, Q#, Assessment Question, <five tick columns>, Topics, Score, Maturity Label, Notes
FIRST_TICK = 4
TOPICS_COL = FIRST_TICK + len(ASKED)
SCORE_COL = TOPICS_COL + 1
HEADERS = ['#', 'Q#', 'Assessment Question'] + ASKED + \
          ['Topics (filled in for you)', 'Score (0–10)', 'Maturity Label', 'Notes / Evidence']

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

    def line(text, size=11, bold=False, colour=INK, space=0):
        ws.append([])
        r = ws.max_row
        c = ws.cell(row=r, column=2, value=text)
        c.font = Font(name='Calibri', size=size, bold=bold, color=colour)
        c.alignment = Alignment(wrap_text=True, vertical='top')
        ws.row_dimensions[r].height = None if not space else space
        return r

    line('GC EA assessment tool — categories', 18, True)
    line('Filled in as an example. Every tick below came from a keyword pass over the question wording and is ours, not yours.'
         if FILLED else 'A template. The tick columns are empty and waiting for you.',
         11, False, MUTED)
    line('')
    line('What we are asking for', 14, True)
    line('Each question already belongs to one domain: the tab it is on. That never changes and you never type it.')
    line('Some questions are also about something else. A question about encrypting a data store is a Data question '
         'and it is also about Security. A question about lifecycle cost is a Business question and it is also about '
         'Financial. Those extra subjects are the categories, and they are what these five columns ask for.')
    line('')
    line('How to fill it in', 14, True)
    line('1.  Go to a question row.')
    line('2.  In each of the five category columns, choose x from the dropdown if the question is about that subject. '
         'Leave it empty if it is not.')
    line('3.  Most questions need nothing. Leaving all five empty means "this one is only about its own domain", '
         'which is true of about three quarters of them.')
    line('4.  The Topics column fills itself from your ticks. Do not type in it.')
    line('')
    line('Why not just type the category names', 14, True)
    line('Because a typed category that nobody recognises scores nothing, on every screen, silently. '
         '"Offical Languages" in one cell out of 176 is not something anybody notices by looking. '
         'A dropdown cannot be mistyped.')
    line('')
    line('The nine categories', 14, True)
    line('Four of them are the domains themselves and are filled in by the tab a question is on: '
         'Business, Data, Application, Technology.')
    line('Five of them are what these columns ask for: Security, Privacy, Financial, Accessibility, Official Languages.')
    line('')
    line('A question can carry as many as apply. It still counts once in the overall score, through its domain, '
         'and it counts at full weight inside every category it carries. So the category scores do not add up to '
         'the overall, and the tool says so.')
    line('')
    line('Never duplicate a question onto a second tab', 14, True, 'B03A2E')
    line('A question that appears on two tabs is counted twice in the overall score, and the department’s number '
         'moves because of how we filed a question. One question, one tab, as many category ticks as you like.')
    line('')
    line('Two categories are empty on purpose', 14, True)
    line('Accessibility and Official Languages have no questions today. A sweep of all 176 found official languages '
         'in two of them and accessibility in three, always in another sense: the FAIR principles’ "Accessible", '
         'and programming languages. Three hits is a gap in the instrument, not a category. They are on the list so '
         'the gap is visible, and they stay empty until questions exist that ask about them.')
    return ws


def domain_sheet(d):
    ws = wb.create_sheet(d['label'][:31])
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.tabColor = d['colour']

    widths = [5, 6, 62] + [11] * len(ASKED) + [26, 11, 16, 34]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    last = len(HEADERS)

    # Row 1: the domain, in its own colour, the way the original sheets open.
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=last)
    title = ws.cell(row=1, column=1, value=f"{d['label']}  ·  {d['tagline']}" if d['tagline'] else d['label'])
    title.font = Font(name='Calibri', size=15, bold=True, color='FFFFFF')
    title.fill = PatternFill('solid', fgColor=d['colour'])
    title.alignment = Alignment(vertical='center', indent=1)
    ws.row_dimensions[1].height = 30

    # Written before the merge: openpyxl makes every cell but the first read-only once merged.
    sub = ws.cell(row=2, column=1, value='   ' + d['weight'])
    sub.font = Font(name='Calibri', size=10, color=MUTED)
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=last)

    for i, h in enumerate(HEADERS, start=1):
        c = ws.cell(row=3, column=i, value=h)
        c.font = Font(name='Calibri', size=10, bold=True, color='FFFFFF')
        c.fill = PatternFill('solid', fgColor=d['colour'])
        c.alignment = Alignment(wrap_text=True, vertical='bottom', horizontal='center' if i >= FIRST_TICK else 'left')
        c.border = box
    ws.row_dimensions[3].height = 34
    ws.freeze_panes = 'D4'

    r = 4
    for row in d['rows']:
        if row['kind'] == 'section':
            ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=last)
            c = ws.cell(row=r, column=1, value=row['text'])
            c.font = Font(name='Calibri', size=11, bold=True, color=d['colour'])
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

        for i, tick in enumerate(row['ticks']):
            c = ws.cell(row=r, column=FIRST_TICK + i, value=tick or None)
            c.alignment = centre
            c.font = Font(name='Calibri', size=11, bold=True, color=d['colour'])

        # The Topics column joins the ticks into what the importer reads. Nobody types here.
        parts = ', '.join(
            f'IF({get_column_letter(FIRST_TICK + i)}{r}="x","{a}","")' for i, a in enumerate(ASKED)
        )
        topics = ws.cell(row=r, column=TOPICS_COL, value=f'=TEXTJOIN(", ",TRUE,{parts})')
        topics.font = Font(name='Calibri', size=10, color=MUTED)
        topics.alignment = Alignment(vertical='center')
        topics.fill = PatternFill('solid', fgColor=BAND)

        for i in range(1, last + 1):
            ws.cell(row=r, column=i).border = box
        ws.row_dimensions[r].height = None
        r += 1

    # One value in the list, so a cell is ticked or it is empty, and nothing else.
    dv = DataValidation(type='list', formula1='"x"', allow_blank=True, showDropDown=False)
    dv.error = 'Choose x from the list, or leave it empty.'
    dv.errorTitle = 'Tick it or leave it'
    dv.prompt = 'x if this question is also about this subject. Empty if it is not.'
    dv.promptTitle = 'Is it also about this?'
    ws.add_data_validation(dv)
    dv.add(f'{get_column_letter(FIRST_TICK)}4:{get_column_letter(FIRST_TICK + len(ASKED) - 1)}{r - 1}')
    return ws


read_me()
for d in payload['sheets']:
    domain_sheet(d)

wb.save(payload['out'])
total = sum(s['questions'] for s in payload['sheets'])
ticks = sum(1 for s in payload['sheets'] for row in s['rows']
            if row['kind'] == 'question' and any(row['ticks']))
print(f"{payload['out'].split('/')[-1]}")
print(f"  {len(payload['sheets'])} domain tabs, {total} questions, "
      f"{len(ASKED)} category columns" + (f", {ticks} rows pre-ticked" if FILLED else ", all empty"))
