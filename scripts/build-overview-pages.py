#!/usr/bin/env python3
"""Build the hidden per-course overview pages from Lindsay's Drive overview docs.

Each course has a long "Course Overview" document in Google Drive (a Google
Doc, or a .docx for two courses). This script renders one hidden page per
course under course-overviews/ plus an index at course-overviews.html.
Pages are unlisted (no nav link, noindex) and shared by direct link only,
for the family overview letters.

Prices never reach the site: price rows/lines in the docs are dropped, and
if any '$' or a "District Dabble Lab" mention survives, the build fails
instead of publishing.

Run from the repo root:  python3 scripts/build-overview-pages.py
"""
import html
import json
import os
import re
import subprocess
import sys
import tempfile

GWS = "/opt/hatch/bin/hatch_gws_cli"
CHROME_SOURCE = "classes-catalog.html"
OUT_DIR = "course-overviews"
INDEX_OUT = "course-overviews.html"

# slug -> (display name, kind, drive file id, index group)
MANIFEST = [
    ("safe-sitter-babysitting", "Safe Sitter® Babysitting", "gdoc",
     "1YYHVQHr0p_wCUp8BPlyCJc73p5bvkx_PEMewWwDOQRs", "Babysitting"),
    ("intro-to-safe-babysitting", "Intro to Safe Babysitting", "gdoc",
     "1HisEcSZGtr_yj-kYS3Jt1p6Bg3RMa3ull9aN4kej7qw", "Babysitting"),
    ("grandparents-getting-started",
     "Safe Sitter® Grandparents: Getting Started", "gdoc",
     "1AgCaSX1JZ1Nu1P2zMHLHZwjUB1dme6VCa6__unYPTw0", "Babysitting"),
    ("safe-at-home", "Safe@Home", "gdoc",
     "1Af5__Zi9T3eNdf4bSW0LOsYeg4QOVM9_6dDn2qornWQ", "Kids Safety"),
    ("social-ready", "Social Ready™", "gdoc",
     "185JSkxH50mfllPWOyliOcIotqBcYmqQlx6Gw_JIgVQc", "Kids Safety"),
    ("stay-ready", "Stay Ready™", "gdoc",
     "1xo9RHFODSiU3R9lLucFEVmENGrXcrccqWSwo5PJm6dA", "Kids Safety"),
    ("steady-and-ready", "Steady and Ready™", "gdoc",
     "1GCz80s0uY_bWizjOl-6m7Wegn17sHGkB_NN5Ep50SMw", "Kids Safety"),
    ("all-kids-welcome", "All Kids Welcome™", "gdoc",
     "1zUT-zKLWSiNlrDk9x1gAy1KM6lSrYRgDkj1w39zb-1o", "Kids Safety"),
    ("season-ready", "Season Ready™", "gdoc",
     "17h7Hgem0cgiW9lLx_nThrpDEHmBmqd1rsFVU2kzOCsw", "Kids Safety"),
    ("ready-period", "Ready. Period.™", "gdoc",
     "1xZnkQv1Po0KTVK7kXtN6uUMSB8jJHzmg4MBXXscqK74", "Kids Safety"),
    ("baby-ready", "Baby Ready™", "gdoc",
     "1UpibpWdbMs2ntGdkGpRTlL6PaTxNUid-SOr1eTnecMg", "Parents & Baby"),
    ("safe-and-ready-families", "Safe & Ready Families™", "gdoc",
     "1fqH796QvtZ_BDX1XWzppHNlntoukeGZPnK_7j8zxHP8", "Parents & Caregivers"),
    ("care-ready", "Care Ready™", "gdoc",
     "1i5vo6u1pRxPogFi_7j1Nl3dMYT6jHjW_Usy3NfpMrew",
     "Nannies & Caregivers"),
    ("my-first-babysitters-club", "My First Babysitter's Club", "gdoc",
     "1TKrl7gMDQ5zdParko8sZM0Plyg_ydvGLhslJXwBQBQ0", "After School Clubs"),
    ("little-medics", "Little Medics", "docx",
     "1SOhw4J0oqVzu6p-g6XxpYUmuegqQSBHa", "After School Clubs"),
    ("first-aid-badge-workshop", "First Aid Badge Workshop", "docx",
     "1YqoS1N0zH7kZWoGt4Ze8LYQ0tKFwmMx7", "Girl Scouts"),
]

BRAND_LINES = {
    "mindful beginnings",
    "lifesaving and caregiving courses for every stage",
    "a mindful beginnings workshop",
    "course overview",
    "mindful beginnings  •  after school clubs",
}
PRICE_LABEL_RE = re.compile(r"^(cost|tuition|price|fee)\b", re.I)
PRICE_LINE_RE = re.compile(r"^(cost|tuition|price|fee)\s*[:\-]", re.I)

# Safe & Ready Families carries a funding note its overview doc does not
# contain: the workshop is free under the Maryland Developmental
# Disabilities Council award, with the federal ACL/HHS acknowledgment
# verbatim (Lindsay, 2026-11-03). Injected at build time so the daily sync
# keeps it. The guard exempts the acknowledgment's dollar figure, which is
# an award total, not a price.
ACL_DISCLAIMER = (
    "This project is supported by the Administration for Community "
    "Living (ACL), U.S. Department of Health and Human Services (HHS) "
    "as part of a financial assistance award totaling $1,262,422 with "
    "100% funding by ACL/HHS. The contents are those of the author(s) "
    "and do not necessarily represent the official views of, nor an "
    "endorsement, by ACL/HHS, or the U.S. Government.")
SRF_NOTE_TEXT = ("This program is FREE. Limited spots available. "
                 + ACL_DISCLAIMER)


def letters(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def is_caps_heading(text):
    if len(text) < 3 or len(text) > 78:
        return False
    cased = [c for c in text if c.isalpha()]
    if len(cased) < 3:
        return False
    return sum(1 for c in cased if c.isupper()) / len(cased) >= 0.85


def price_free_table(rows):
    kept = []
    for cells in rows:
        if not cells:
            continue
        label = cells[0].strip()
        joined = " ".join(cells)
        if PRICE_LABEL_RE.match(label) or "$" in joined:
            continue
        kept.append(cells)
    return kept


def runs_html(runs):
    out = []
    for text, bold, italic, link in runs:
        t = html.escape(text)
        if not t:
            continue
        if link:
            t = '<a href="%s">%s</a>' % (html.escape(link, quote=True), t)
        if bold:
            t = "<strong>%s</strong>" % t
        if italic:
            t = "<em>%s</em>" % t
        out.append(t)
    return "".join(out)


class Cleaner:
    """Drops the doc's own title block (brand lines + title fragments)."""

    def __init__(self, display):
        self.display_letters = letters(display)
        self.head_count = 0
        self.frag_letters = ""

    def drop(self, text):
        if self.head_count >= 8:
            return False
        self.head_count += 1
        norm = re.sub(r"\s+", " ", text.strip().lower())
        if norm in BRAND_LINES or "mindful beginnings" in norm and "•" in text:
            return True
        lt = letters(text)
        words = len(text.split())
        if lt and words <= 4 and self.display_letters.startswith(
                self.frag_letters + lt):
            self.frag_letters += lt
            return True
        return False


def gdoc_blocks(file_id):
    out = subprocess.run(
        [GWS, "docs", "documents", "get", "--params",
         json.dumps({"documentId": file_id})],
        capture_output=True, text=True, check=True)
    d = json.loads(out.stdout)
    doc = d.get("document", d)
    blocks = []
    for el in doc.get("body", {}).get("content", []):
        p = el.get("paragraph")
        if p:
            runs = []
            for e in p.get("elements", []):
                tr = e.get("textRun")
                if not tr:
                    continue
                ts = tr.get("textStyle", {})
                link = (ts.get("link") or {}).get("url", "")
                runs.append((tr.get("content", ""), bool(ts.get("bold")),
                             bool(ts.get("italic")), link))
            text = "".join(r[0] for r in runs).replace("\n", "").strip()
            if not text:
                continue
            ps = p.get("paragraphStyle", {})
            blocks.append({
                "type": "para", "text": text, "runs": runs,
                "style": ps.get("namedStyleType", "NORMAL_TEXT"),
                "bullet": "bullet" in ps,
            })
            continue
        tb = el.get("table")
        if tb:
            rows = []
            for row in tb.get("tableRows", []):
                cells = []
                for c in row.get("tableCells", []):
                    ct = " ".join(
                        "".join(e.get("textRun", {}).get("content", "")
                                for e in el2.get("paragraph", {})
                                .get("elements", [])).strip()
                        for el2 in c.get("content", [])
                        if el2.get("paragraph"))
                    cells.append(re.sub(r"\s+", " ", ct).strip())
                rows.append(cells)
            blocks.append({"type": "table", "rows": rows})
    return blocks


def docx_blocks(file_id):
    from docx import Document
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
        path = f.name
    try:
        subprocess.run(
            [GWS, "drive", "files", "get", "--params",
             json.dumps({"fileId": file_id, "alt": "media"}),
             "--output", path],
            capture_output=True, text=True, check=True)
        doc = Document(path)
    finally:
        os.unlink(path)
    blocks = []
    body = doc.element.body
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    for child in body.iterchildren():
        if child.tag.endswith("}p"):
            p = Paragraph(child, doc)
            text = p.text.strip()
            if not text:
                continue
            style = (p.style.name if p.style else "") or ""
            runs = [(r.text, bool(r.bold), bool(r.italic), "")
                    for r in p.runs]
            blocks.append({
                "type": "para", "text": text, "runs": runs,
                "style": ("HEADING_2" if style.startswith("Heading 1") else
                          "HEADING_3" if style.startswith("Heading 2") else
                          "NORMAL_TEXT"),
                "bullet": "List" in style or "Bullet" in style,
            })
        elif child.tag.endswith("}tbl"):
            t = Table(child, doc)
            rows = [[re.sub(r"\s+", " ", c.text).strip() for c in r.cells]
                    for r in t.rows]
            blocks.append({"type": "table", "rows": rows})
    return blocks


def render_blocks(blocks, display):
    clean = Cleaner(display)
    out = []
    pending = []

    def flush_list():
        if pending:
            out.append('<ul class="ov-list">%s</ul>' % "".join(
                "<li>%s</li>" % x for x in pending))
            pending.clear()

    first_blurb = ""
    for b in blocks:
        if b["type"] == "table":
            flush_list()
            rows = price_free_table(b["rows"])
            if not rows:
                continue
            trs = "".join(
                "<tr>%s</tr>" % "".join(
                    '<th scope="row">%s</th>' % html.escape(c) if i == 0
                    else "<td>%s</td>" % html.escape(c)
                    for i, c in enumerate(cells))
                for cells in rows)
            out.append('<table class="ov-table">%s</table>' % trs)
            continue
        text = b["text"]
        if clean.drop(text):
            continue
        if "$" in text and PRICE_LINE_RE.match(text):
            continue
        body = runs_html(b["runs"]) or html.escape(text)
        if not first_blurb and not is_caps_heading(text) \
                and b["style"] == "NORMAL_TEXT" and not b["bullet"]:
            first_blurb = text
        if b["style"] in ("HEADING_1", "HEADING_2", "TITLE"):
            flush_list()
            out.append('<h2 class="ov-h2">%s</h2>' % body)
        elif b["style"] == "HEADING_3" or is_caps_heading(text):
            flush_list()
            out.append('<h3 class="ov-h3">%s</h3>' % body)
        elif b["bullet"]:
            pending.append(body)
        else:
            flush_list()
            out.append('<p class="ov-p">%s</p>' % body)
    flush_list()
    return "\n".join(out), first_blurb


def chrome():
    src = open(CHROME_SOURCE).read()
    header = src[src.index("<header"):src.index("</header>") + len("</header>")]
    footer = src[src.index("<footer"):src.index("</footer>") + len("</footer>")]
    m = re.search(r"site\.css\?v=(\d+)", src)
    return header, footer, (m.group(1) if m else "1")


PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{NAME} Course Overview | Mindful Beginnings</title>
<meta name="description" content="Full course overview for {NAME} from Mindful Beginnings: what students learn, what is included, and who teaches it.">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/x-icon" href="/favicon.ico?v=2">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Montserrat:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/site.css?v={CSS_V}">
<style>
.ov-main{max-width:760px;margin:0 auto;padding:26px 6vw 10px}
.ov-h2{font-size:21px;font-weight:800;color:var(--navy);margin:26px 0 8px}
.ov-h3{font-size:16px;font-weight:800;color:var(--navy);letter-spacing:.02em;margin:22px 0 6px}
.ov-p{font-size:16.5px;line-height:1.65;color:#33475F;margin:0 0 10px}
.ov-list{margin:0 0 12px;padding-left:22px}
.ov-list li{font-size:16.5px;line-height:1.6;color:#33475F;margin-bottom:6px}
.ov-table{width:100%;border-collapse:collapse;margin:14px 0 20px;background:#fff;border:1px solid rgba(30,49,97,.12);border-radius:16px;overflow:hidden}
.ov-table th,.ov-table td{padding:11px 16px;font-size:15.5px;line-height:1.5;text-align:left;vertical-align:top;border-bottom:1px solid rgba(30,49,97,.08)}
.ov-table th{font-weight:800;color:var(--navy);background:#DCE4EF;width:34%;letter-spacing:.02em}
.ov-table tr:last-child th,.ov-table tr:last-child td{border-bottom:0}
.ov-band{background:var(--navy);color:#FBFAF7;padding:38px 6vw;margin-top:36px}
.ov-band-in{max-width:760px;margin:0 auto;text-align:center}
.ov-band h2{margin:0 0 8px;font-size:clamp(22px,2.4vw,28px);font-weight:800;color:#FBFAF7}
.ov-band p{margin:0 auto 18px;font-size:16.5px;line-height:1.6;max-width:620px}
.ov-band .mb-btn{margin:4px}
.ov-back{display:inline-block;margin-top:22px;font-weight:700;color:var(--navy);text-decoration:none}
</style>
</head>
<body>
{HEADER}
<section class="mb-hero">
<div class="mb-hero-inner">
<p class="mb-eyebrow">course overview</p>
<h1>{NAME}</h1>
</div>
</section>
<main class="ov-main">
{BODY}
<a class="ov-back" href="/course-overviews">See all course overviews</a>
</main>
<section class="ov-band"><div class="ov-band-in">
<h2>Ready to book your class?</h2>
<p>Pricing depends on the size of your group and your location. Contact us for a custom quote and next steps for scheduling.</p>
<a class="mb-btn mb-btn-gold" href="/register.html">See upcoming classes</a>
<a class="mb-btn mb-btn-outline" href="/contact.html">Contact us</a>
</div></section>
{FOOTER}
</body>
</html>
"""

INDEX = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Course Overviews | Mindful Beginnings</title>
<meta name="description" content="Full overviews of Mindful Beginnings courses: babysitting, home alone, first aid, CPR, and more for kids, teens, parents, and caregivers.">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/x-icon" href="/favicon.ico?v=2">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Montserrat:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/site.css?v={CSS_V}">
<style>
.ov-main{max-width:860px;margin:0 auto;padding:8px 6vw 30px}
.ov-group{margin-top:28px}
.ov-group h2{background:#DCE4EF;border-radius:16px;padding:16px 20px;margin:0 -18px 4px;font-size:clamp(24px,2.6vw,30px);font-weight:800;color:var(--navy)}
.ov-row{display:block;padding:15px 0 13px;border-bottom:1px solid rgba(30,49,97,.1);text-decoration:none}
.ov-row .ov-name{font-size:19px;font-weight:800;color:var(--navy)}
.ov-row .ov-blurb{display:block;font-size:15.5px;line-height:1.55;color:#43527A;margin-top:3px}
.ov-row:hover .ov-name{color:#617CA3}
@media(max-width:700px){.ov-group h2{margin:0 -6px 4px}}
</style>
</head>
<body>
{HEADER}
<section class="mb-hero">
<div class="mb-hero-inner">
<p class="mb-eyebrow">everything we teach</p>
<h1>Course overviews</h1>
<p class="mb-lede">The full overview for each Mindful Beginnings course: what students learn, what is included, and who teaches it. Pricing depends on the size of your group and your location, so contact us for a custom quote for your group.</p>
</div>
</section>
<main class="ov-main">
{GROUPS}
</main>
{FOOTER}
</body>
</html>
"""


def guard(page, slug):
    body = page[page.index("</head>"):]
    # The Safe & Ready Families funding acknowledgment names a dollar
    # figure; it is not a price. Scan a copy with it removed so the price
    # guard still trips on anything else.
    scan = body.replace(ACL_DISCLAIMER, "")
    for bad in ("$", "dabble"):
        if bad in scan.lower() if bad == "dabble" else bad in scan:
            raise SystemExit("FAIL %s: forbidden content %r survived" %
                             (slug, bad))


def main():
    header, footer, css_v = chrome()
    os.makedirs(OUT_DIR, exist_ok=True)
    groups = {}
    order = []
    for slug, display, kind, fid, group in MANIFEST:
        blocks = gdoc_blocks(fid) if kind == "gdoc" else docx_blocks(fid)
        body, blurb = render_blocks(blocks, display)
        # The overview doc says 6 to 20. The published class size is 10 to 25.
        if slug == "safe-and-ready-families":
            body = body.replace("6 to 20", "10 to 25")
            note = '<p class="mb-note">%s</p>' % SRF_NOTE_TEXT
            anchor = '<h3 class="ov-h3">Host a class</h3>'
            if anchor in body:
                body = body.replace(anchor, note + "\n" + anchor, 1)
            elif "mb-note" not in body:
                body = body + "\n" + note
        page = PAGE.replace("{CSS_V}", css_v).replace("{HEADER}", header) \
            .replace("{FOOTER}", footer).replace("{NAME}", html.escape(display)) \
            .replace("{BODY}", body)
        guard(page, slug)
        with open(os.path.join(OUT_DIR, slug + ".html"), "w") as f:
            f.write(page)
        blurb = re.sub(r"\s+", " ", blurb).strip()
        if len(blurb) > 150:
            blurb = blurb[:147].rsplit(" ", 1)[0] + "..."
        if group not in groups:
            groups[group] = []
            order.append(group)
        groups[group].append((slug, display, blurb))
        print("built", slug)
    parts = []
    for g in order:
        rows = "".join(
            '<a class="ov-row" href="/course-overviews/%s">'
            '<span class="ov-name">%s</span>'
            '<span class="ov-blurb">%s</span></a>'
            % (slug, html.escape(name), html.escape(blurb))
            for slug, name, blurb in groups[g])
        parts.append('<section class="ov-group"><h2>%s</h2>%s</section>'
                     % (html.escape(g), rows))
    index = INDEX.replace("{CSS_V}", css_v).replace("{HEADER}", header) \
        .replace("{FOOTER}", footer).replace("{GROUPS}", "".join(parts))
    guard(index, "index")
    with open(INDEX_OUT, "w") as f:
        f.write(index)
    print("wrote index with", len(MANIFEST), "course pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
