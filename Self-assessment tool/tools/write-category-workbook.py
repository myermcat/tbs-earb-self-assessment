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
CAT_HEADERS = payload['catHeaders']
CAT_COL = 4                                   # the first of three, all sharing one picker
TYPE_COL = CAT_COL + len(CAT_HEADERS)
ANSWER_COL = TYPE_COL + 1
HEADERS = (['#', 'Q#', 'Assessment Question'] + CAT_HEADERS
           + ['Answer type', 'Answer', 'Maturity Label', 'Notes / Evidence'])

# One list, on every row, holding everything an answer can be.
#
# The first version gave each row only the picker matching what we thought that question was:
# 0 to 10 on most, Yes and No on ten. That is backwards. Which questions are binary is a
# judgement somebody makes while reading them, and the sheet exists so that somebody can make
# it. A picker that has already decided leaves them nothing to do but agree, and on the next
# question set there is nobody who knows in advance at all.
#
# So the Answer type column is where the judgement goes, and the Answer column takes any of
# them from any row.
ANSWER_PICK = [str(n) for n in range(11)] + ['Yes', 'No', 'N/A']

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
    line('1.  Click a cell in the Categories column. A dropdown appears with the five.')
    line('2.  Tick as many as apply. Most questions need none; 130 of the 176 stay empty, which '
         'means "this one is only about its own domain".')
    line()
    line('If you do type into these cells instead, the tool checks every name when it reads this '
         'file and refuses the whole import if one is not recognised, naming the question it was '
         'in. A category nobody recognises would otherwise score nothing, on every screen, and '
         'never be noticed.')
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

    for i, w in enumerate([5, 6, 58] + [30] * len(CAT_HEADERS) + [13, 11, 15, 30], start=1):
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

    acol = get_column_letter(ANSWER_COL)
    sections = []                    # (row of the header, weight, first question row)
    r = 4
    for row in d['rows']:
        if row['kind'] == 'section':
            # Merge everything except the two columns the section's own score lives in, so the
            # band still reads as one bar and still has somewhere to put a number.
            ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=ANSWER_COL - 1)
            c = ws.cell(row=r, column=1, value=row['text'])
            c.font = Font(name='Calibri', size=11, bold=True, color=HEAD)
            c.alignment = Alignment(vertical='center', indent=1)
            for i in range(1, last + 1):
                ws.cell(row=r, column=i).fill = PatternFill('solid', fgColor=BAND)
            ws.row_dimensions[r].height = 24
            sections.append({'head': r, 'weight': row.get('weight') or 0, 'first': r + 1})
            r += 1
            continue

        ws.cell(row=r, column=1, value=row['num']).alignment = centre
        ws.cell(row=r, column=2, value=row['q']).alignment = centre
        q = ws.cell(row=r, column=3, value=row['text'])
        q.alignment = wrap_top
        q.font = Font(name='Calibri', size=10.5)

        # The columns anybody has to fill in, tinted so it is obvious which ones they are.
        for n, value in enumerate(row['categories']):
            cat = ws.cell(row=r, column=CAT_COL + n, value=value or None)
            cat.alignment = Alignment(vertical='center', horizontal='center', wrap_text=True)
            cat.font = Font(name='Calibri', size=10, bold=bool(value), color=HEAD)
            cat.fill = PatternFill('solid', fgColor=PICK_BG)

        kind = ws.cell(row=r, column=TYPE_COL, value=row['answerType'])
        kind.alignment = centre
        kind.font = Font(name='Calibri', size=10, color=HEAD,
                         bold=row['answerType'].startswith('Yes'))
        kind.fill = PatternFill('solid', fgColor=PICK_BG)

        # Dan's own column, and his fills itself, so this one does too: the Assessment Scale tab
        # is the lookup, and a score of 7 reads back "Scalable & Secure". A yes-or-no answer has
        # no maturity, and neither does an empty cell, so both come back blank rather than as an
        # error somebody has to ignore on 176 rows.
        acol = get_column_letter(ANSWER_COL)
        label = ws.cell(row=r, column=ANSWER_COL + 1, value=(
            f'=IF(OR({acol}{r}="",NOT(ISNUMBER({acol}{r}))),"",'
            f"IFERROR(VLOOKUP({acol}{r},'Assessment Scale'!$A$3:$C$13,3,FALSE),\"\"))"
        ))
        label.alignment = Alignment(vertical='center')
        label.font = Font(name='Calibri', size=10, color=MUTED)

        for i in range(1, last + 1):
            ws.cell(row=r, column=i).border = box
        r += 1

    def picker(values, cells, prompt, title):
        if not cells:
            return
        # Reject rather than warn. A Google Sheets dropdown can only hold more than one value
        # when it rejects what is not on the list, so a warning-only rule arrives with "Allow
        # multiple selections" greyed out.
        dv = DataValidation(type='list', formula1='"%s"' % ','.join(values).replace('"', ''),
                            allow_blank=True, showErrorMessage=True)
        dv.prompt = prompt
        dv.promptTitle = title
        ws.add_data_validation(dv)
        for c in cells:
            dv.add(c)

    # One picker, three columns. A spreadsheet has no multi-select dropdown, and putting the
    # combinations into one list does not work: a validation list is itself comma separated, so
    # "Security, Privacy" splits into two entries and the list shows five choices instead of
    # eleven. Three columns give the same answer with nothing typed.
    for n in range(len(CAT_HEADERS)):
        col = get_column_letter(CAT_COL + n)
        picker(PICKS, [f'{col}4:{col}{r - 1}'],
               'The subjects this question is also about, beyond its own domain. Tick as many '
               'as apply. Leave it empty when there are none.',
               'What else is it about?')

    tcol = get_column_letter(TYPE_COL)
    picker(['Scale 0-10', 'Yes / No'], [f'{tcol}4:{tcol}{r - 1}'],
           'How this question is answered. Ours, and provisional: change it if it reads wrong.',
           'Scale or yes-or-no?')

    # The sheet does the arithmetic, because a spreadsheet that shows how the tool works has to
    # work. Each section band carries the average of its own answers; AVERAGE ignores text, so
    # Yes, No and N/A drop out of it exactly as they drop out of the tool.
    for i, sec in enumerate(sections):
        end = (sections[i + 1]['head'] - 1) if i + 1 < len(sections) else (r - 1)
        if end < sec['first']:
            continue
        cell = ws.cell(row=sec['head'], column=ANSWER_COL,
                       value=f"=IFERROR(ROUND(AVERAGE({acol}{sec['first']}:{acol}{end}),1),\"\")")
        cell.alignment = centre
        cell.font = Font(name='Calibri', size=11, bold=True, color=HEAD)
        weight = ws.cell(row=sec['head'], column=ANSWER_COL + 1, value=sec['weight'] / 100)
        weight.number_format = '0%'
        weight.alignment = centre
        weight.font = Font(name='Calibri', size=9, color=MUTED)

    # The domain's own score, where the dashboard reads it from. Weighted by the section weights
    # that have a score, so a half-finished sheet still reports out of ten rather than low.
    # The domain's own score, where the dashboard reads it from. Weighted by the section
    # weights, and divided only by the weights of the sections that have a score, so a
    # half-finished sheet still reports out of ten rather than reporting low.
    wcol = get_column_letter(ANSWER_COL + 1)
    cells = [(f'{acol}{x["head"]}', f'{wcol}{x["head"]}') for x in sections]
    top = '+'.join(f'N({a})*N({w})' for a, w in cells)
    bot = '+'.join(f'({a}<>"")*N({w})' for a, w in cells)
    total = r + 1
    ws.cell(row=total, column=1, value='Domain score, weighted across the sections answered').font = \
        Font(name='Calibri', size=11, bold=True, color=HEAD)
    ws.merge_cells(start_row=total, start_column=1, end_row=total, end_column=ANSWER_COL - 1)
    dom = ws.cell(row=total, column=ANSWER_COL, value=f'=IFERROR(ROUND(({top})/({bot}),1),"")')
    dom.font = Font(name='Calibri', size=13, bold=True, color=HEAD)
    dom.alignment = centre
    for i in range(1, last + 1):
        ws.cell(row=total, column=i).fill = PatternFill('solid', fgColor=PICK_BG)
        ws.cell(row=total, column=i).border = box
    ws.cell(row=total, column=ANSWER_COL + 1, value='out of 10').font = Font(name='Calibri', size=9, color=MUTED)


    # One list on the whole column, so any answer can go on any row.
    picker(ANSWER_PICK, [f'{acol}4:{acol}{r - 1}'],
           'A maturity score from 0 to 10, or Yes or No for a question that reads as one, or '
           'N/A when the question does not apply.', 'The answer')
    return ws, f"'{ws.title}'!{acol}{total}"


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
            # The score is written as a number. It arrives from the CSV as text, and a VLOOKUP
            # of a number against text matches nothing, so the Maturity Label column on every
            # question sheet would have come back empty.
            if i == 1 and (v or '').strip().isdigit():
                v = int(v.strip())
            c = ws.cell(row=r, column=i, value=v if v != '' else None)
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
domain_totals = []
for d in payload['sheets']:
    _, where = domain_sheet(d)
    domain_totals.append((d['label'], where))
scale_sheet(payload['scale'])

# Dan's Summary Dashboard, wired to the four sheets the way his own is meant to be.
#
# It computed nothing in the first version and said so, which was the wrong call: a spreadsheet
# that exists to show how the tool works has to work. Each domain reads its own total, the
# overall is the four of them at 25% each over the ones that have a score, and the maturity
# label comes off the same ladder every question uses.
dash = plain_sheet('Summary Dashboard', payload['dashboard'], [46, 14, 24, 34])
SCALE = "'Assessment Scale'!$A$3:$C$13"
rows = []
for i, (label, where) in enumerate(domain_totals):
    row = 4 + i
    rows.append(row)
    c = dash.cell(row=row, column=2, value=f'=IFERROR({where},"")')
    c.font = Font(name='Calibri', size=12, bold=True, color=HEAD)
    c.alignment = centre
    dash.cell(row=row, column=3, value=(
        f'=IF(B{row}="","Awaiting input",IFERROR(VLOOKUP(ROUND(B{row},0),{SCALE},3,FALSE),"Awaiting input"))'
    )).font = Font(name='Calibri', size=10.5)

top = '+'.join(f'N(B{n})' for n in rows)
bot = '+'.join(f'(B{n}<>"")' for n in rows)
overall_row = None
for rr in range(1, dash.max_row + 1):
    if 'OVERALL' in str(dash.cell(row=rr, column=1).value or ''):
        overall_row = rr
        break
if overall_row:
    o = dash.cell(row=overall_row, column=2, value=f'=IFERROR(ROUND(({top})/({bot}),1),"")')
    o.font = Font(name='Calibri', size=14, bold=True, color=HEAD)
    o.alignment = centre
    dash.cell(row=overall_row, column=3, value=(
        f'=IF(B{overall_row}="","Awaiting input",'
        f'IFERROR(VLOOKUP(ROUND(B{overall_row},0),{SCALE},3,FALSE),"Awaiting input"))'
    )).font = Font(name='Calibri', size=12, bold=True)

note = dash.cell(row=dash.max_row + 2, column=1,
                 value='Every number on this tab is calculated from the four question sheets. '
                       'The four domains carry 25% each, and a domain with no answers yet is '
                       'left out of the overall rather than counted as zero.')
note.font = Font(name='Calibri', size=10, italic=True, color=MUTED)
note.alignment = wrap_top

wb.save(payload['out'])
total = sum(s['questions'] for s in payload['sheets'])
done = sum(1 for s in payload['sheets'] for row in s['rows']
           if row['kind'] == 'question' and any(row['categories']))
print(payload['out'].split('/')[-1])
print(f"  {len(wb.sheetnames)} tabs, {total} questions, {len(CAT_HEADERS)} category columns "
      f"sharing one picker of {len(PICKS)}"
      + (f", {done} rows pre-filled" if FILLED else ", all empty"))
