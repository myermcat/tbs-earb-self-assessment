#!/usr/bin/env python3
"""
Fill the published TBS concept case template from draft-content.md.

The template's answer cells are cell-level content controls showing placeholder text.
Filling one means dropping showingPlcHdr, dropping the placeholder reference, and
replacing the paragraphs inside sdtContent/tc. Everything else in the file is left
exactly as TBS published it.

Anything marked [TO CONFIRM ...] or [TARGET TO CONFIRM ...] in the source is drawn with a
yellow highlight, so an unfilled blank cannot be read past.

    python3 build-concept-case.py
"""

import re
import shutil
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
w = lambda tag: f"{{{W}}}{tag}"
ET.register_namespace("w", W)
ET.register_namespace("w14", "http://schemas.microsoft.com/office/word/2010/wordml")
ET.register_namespace("mc", "http://schemas.openxmlformats.org/markup-compatibility/2006")

HERE = Path(__file__).parent
TEMPLATE = HERE / "Template (as published by TBS)" / "Concept case template (TBS, EN) - 32593-eng.docx"
SOURCE = HERE / "draft-content.md"
OUT = HERE / "Concept case - GC EA assessment - DRAFT with blanks.docx"

# Body child index of each table, and which row holds the answer.
HEADER_TABLE = 5
HEADER_ROWS = {0: "Proposed initiative", 1: "Department", 2: "Assistant Deputy Minister business owner", 3: "Date"}
SECTION_TABLES = {
    7: "1. Problem or opportunity statement",
    9: "2. Current state or context",
    11: "3. Root cause",
    13: "4. Desired business outcome",
    15: "5. Future state",
    17: "6. Next steps",
}


# ---------------------------------------------------------------- source

def read_source():
    """Split draft-content.md into {heading: [raw lines]}."""
    text = SOURCE.read_text(encoding="utf-8")
    sections, current = {}, None
    for line in text.splitlines():
        if line.startswith("## "):
            current = line[3:].strip()
            sections[current] = []
        elif current is not None:
            sections[current].append(line)
    return sections


def unwrap(lines):
    """Join hard-wrapped lines into blocks. A block is a paragraph or one list item."""
    blocks, buf, kind = [], [], "p"
    def flush():
        if buf:
            blocks.append((kind, " ".join(buf).strip()))
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped == "---":
            flush(); buf, kind = [], "p"
            continue
        num = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        bullet = re.match(r"^[-*]\s+(.*)$", stripped)
        if num:
            flush(); buf, kind = [f"{num.group(1)}. {num.group(2)}"], "li"
        elif bullet:
            flush(); buf, kind = [bullet.group(1)], "li"
        elif line.startswith(("   ", "\t")) and kind == "li":
            buf.append(stripped)
        else:
            if kind == "li":
                flush(); buf, kind = [stripped], "p"
            else:
                buf.append(stripped)
    flush()
    return [b for b in blocks if b[1]]


def runs_of(text):
    """Inline parse: **bold**, [TO CONFIRM ...] highlighted, `code` stripped."""
    # The template's own prose uses curly apostrophes, so match it.
    text = text.replace("`", "").replace("'", "’")
    out, pos = [], 0
    pattern = re.compile(r"\*\*(.+?)\*\*|(\[(?:TARGET )?TO CONFIRM[^\]]*\])", re.S)
    for m in pattern.finditer(text):
        if m.start() > pos:
            out.append((text[pos:m.start()], False, False))
        if m.group(1) is not None:
            out.append((m.group(1), True, False))
        else:
            out.append((m.group(2), True, True))
        pos = m.end()
    if pos < len(text):
        out.append((text[pos:], False, False))
    return [(t, b, h) for t, b, h in out if t]


# ---------------------------------------------------------------- docx

def paragraph(blocks_entry, last):
    kind, text = blocks_entry
    p = ET.Element(w("p"))
    pPr = ET.SubElement(p, w("pPr"))
    spacing = ET.SubElement(pPr, w("spacing"))
    spacing.set(w("after"), "0" if last else "120")
    spacing.set(w("line"), "260")
    spacing.set(w("lineRule"), "auto")
    if kind == "li":
        ind = ET.SubElement(pPr, w("ind"))
        ind.set(w("left"), "360")
        ind.set(w("hanging"), "360")
    ET.SubElement(pPr, w("widowControl"))
    for text_run, bold, highlight in runs_of(text):
        r = ET.SubElement(p, w("r"))
        rPr = ET.SubElement(r, w("rPr"))
        if bold:
            ET.SubElement(rPr, w("b"))
        if highlight:
            ET.SubElement(rPr, w("highlight")).set(w("val"), "yellow")
        t = ET.SubElement(r, w("t"))
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t.text = text_run
    return p


def fill(tr, blocks):
    """Write blocks into a row's answer cell.

    Five of the six sections wrap that cell in a content control showing placeholder text;
    Next steps is a plain cell whose guidance is ordinary paragraphs. Handle both.
    """
    sdt = tr.find(w("sdt"))
    if sdt is None:
        tc = tr.findall(w("tc"))[-1]
    else:
        sdtPr = sdt.find(w("sdtPr"))
        for tag in ("showingPlcHdr", "placeholder"):
            node = sdtPr.find(w(tag))
            if node is not None:
                sdtPr.remove(node)
        # The grey placeholder colour lives on sdtPr/rPr and would tint what we write.
        rPr = sdtPr.find(w("rPr"))
        if rPr is not None:
            sdtPr.remove(rPr)
        tc = sdt.find(w("sdtContent")).find(w("tc"))

    # Clear everything except the cell's own properties. Removing only direct w:p children
    # leaves the Next steps guidance behind, because that cell nests its text in a
    # block-level content control of its own.
    for child in list(tc):
        if child.tag != w("tcPr"):
            tc.remove(child)
    for i, block in enumerate(blocks):
        tc.append(paragraph(block, last=(i == len(blocks) - 1)))


def main():
    sections = read_source()

    header = {}
    for kind, text in unwrap(sections["Header"]):
        m = re.match(r"^\*\*(.+?):\*\*\s*(.*)$", text)
        if m:
            header[m.group(1)] = m.group(2)

    shutil.copyfile(TEMPLATE, OUT)
    with zipfile.ZipFile(TEMPLATE) as z:
        names = z.namelist()
        parts = {n: z.read(n) for n in names}

    root = ET.fromstring(parts["word/document.xml"].decode("utf-8"))
    body = root.find(w("body"))

    filled = []
    for row_index, label in HEADER_ROWS.items():
        tr = body[HEADER_TABLE].findall(w("tr"))[row_index]
        value = header.get(label, "")
        fill(tr, [("p", value)])
        filled.append(f"header/{label}")

    for table_index, heading in SECTION_TABLES.items():
        blocks = unwrap(sections[heading])
        tr = body[table_index].findall(w("tr"))[1]
        fill(tr, blocks)
        filled.append(f"{heading} ({len(blocks)} blocks)")

    parts["word/document.xml"] = ET.tostring(root, encoding="UTF-8", xml_declaration=True)

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.writestr(n, parts[n])

    print(f"wrote {OUT.name}")
    for line in filled:
        print(f"  filled {line}")


if __name__ == "__main__":
    main()
