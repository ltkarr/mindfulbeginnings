#!/usr/bin/env python3
"""Build the hidden course-overviews.html page from the Program Guide Google Doc.

The page is unlisted (no nav link, noindex) and shared by direct link only.
Prices are stripped: Lindsay's rule is no prices on the website; the Guide
keeps the prices and stays her quoting source. If any '$' survives the
stripping rules, the build fails instead of publishing a price.

Run from the repo root:  python3 scripts/build-course-overviews.py
"""
import html
import json
import re
import subprocess
import sys

DOC_ID = "1IL6bcHAL-EV1HOkeSwpwJbKyC8xL5isY7OyFCjPNK5Q"
GWS = "/opt/hatch/bin/hatch_gws_cli"
OUT = "course-overviews.html"
CHROME_SOURCE = "classes-catalog.html"

SECTION_NAMES = {
    "BABYSITTING": "Babysitting",
    "KIDS SAFETY": "Kids Safety",
    "RED CROSS CERTIFICATION": "Red Cross Certification",
    "PARENTS & BABY": "Parents & Baby",
    "NANNIES, AU PAIRS, GRANDPARENTS & ADULT CAREGIVERS":
        "Nannies, Au Pairs, Grandparents & Adult Caregivers",
    "TEENS & COLLEGE": "Teens & College",
    "GIRL SCOUTS & GROUPS": "Girl Scouts & Groups",
    "AFTER SCHOOL CLUBS": "After School Clubs",
}

PRICE_RE = re.compile(
    r",?\s*\$[\d,]+(?:\.\d+)?\s*(?:flat\s*)?(?:per participant|per person|/participant)?")


def fetch_doc():
    out = subprocess.run(
        [GWS, "docs", "documents", "get", "--params",
         json.dumps({"documentId": DOC_ID})],
        capture_output=True, text=True, check=True)
    d = json.loads(out.stdout)
    return d.get("document", d)


def paragraphs(doc):
    """Yield (text, bold, size) for each non-empty paragraph."""
    for el in doc.get("body", {}).get("content", []):
        p = el.get("paragraph")
        if not p:
            continue
        text = ""
        bold = None
        size = None
        for e in p.get("elements", []):
            tr = e.get("textRun")
            if not tr:
                continue
            text += tr.get("content", "")
            ts = tr.get("textStyle", {})
            if bold is None and "bold" in ts:
                bold = ts.get("bold")
            if size is None:
                fs = ts.get("fontSize") or {}
                if fs.get("magnitude"):
                    size = fs["magnitude"]
        text = text.replace("\n", "").strip()
        if text:
            yield text, bold, size


def strip_prose(text):
    """Drop any sentence that mentions a price."""
    if "$" not in text:
        return text
    sentences = re.split(r"(?<=[.!?])\s+", text)
    kept = [s for s in sentences if "$" not in s]
    return " ".join(kept).strip()


def clean_spec_line(text):
    """Remove prices from a specs line, segment by segment."""
    out = []
    for seg in text.split("•"):
        seg = seg.strip()
        if not seg:
            continue
        if "$" in seg and re.search(r"virtual session is", seg, re.I):
            continue  # the segment's only content was the virtual price
        seg = PRICE_RE.sub("", seg)
        seg = re.sub(r"\s+", " ", seg).strip().rstrip(":,").strip()
        if not seg or "$" in seg:
            continue
        out.append(seg)
    return " • ".join(out)


def slugify(name):
    s = name.replace("™", "").replace("®", "").replace("&", "and")
    s = s.replace("@", "")
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return re.sub(r"-{2,}", "-", s)


def parse(doc):
    intro_notes = []
    sections = []
    section = None
    course = None
    seen_section = False
    for text, bold, size in paragraphs(doc):
        if size == 21:  # section header
            if text.upper().startswith("READY TO BOOK"):
                break
            seen_section = True
            section = {"name": SECTION_NAMES.get(text.upper(), text.title()),
                       "slug": slugify(text), "intro": [], "courses": []}
            sections.append(section)
            course = None
            continue
        if not seen_section:
            if text in ("M I N D F U L   B E G I N N I N G S",
                        "Safety and Confidence for All Ages", "Program Guide"):
                continue
            intro_notes.append(strip_prose(text))
            continue
        if bold and size == 11.5:  # course title: "Name\t<price>"
            name = text.split("\t")[0].strip()
            course = {"name": name, "slug": slugify(name),
                      "desc": [], "specs": []}
            section["courses"].append(course)
            continue
        if course is None:
            section["intro"].append(strip_prose(text))
        elif size == 9.5:
            line = clean_spec_line(text)
            if line:
                course["specs"].append(line)
        else:
            course["desc"].append(strip_prose(text))
    return intro_notes, sections


def chrome():
    src = open(CHROME_SOURCE).read()
    header = src[src.index("<header"):src.index("</header>") + len("</header>")]
    footer = src[src.index("<footer"):src.index("</footer>") + len("</footer>")]
    m = re.search(r"site\.css\?v=(\d+)", src)
    return header, footer, (m.group(1) if m else "1")


def render(intro_notes, sections):
    header, footer, css_v = chrome()
    jump = "".join(
        '<a href="#%s">%s</a>' % (s["slug"], html.escape(s["name"]))
        for s in sections)
    intro_html = "".join(
        '<p class="ov-note">%s</p>' % html.escape(t) for t in intro_notes if t)
    parts = []
    for s in sections:
        rows = []
        for t in s["intro"]:
            if t:
                rows.append('<p class="ov-intro">%s</p>' % html.escape(t))
        for c in s["courses"]:
            cert = ('<p class="ov-cert">American Red Cross certification</p>'
                    if s["name"] == "Red Cross Certification" else "")
            specs = "".join('<p class="ov-meta">%s</p>' % html.escape(x)
                            for x in c["specs"])
            desc = "".join('<p class="ov-desc">%s</p>' % html.escape(x)
                           for x in c["desc"] if x)
            rows.append(
                '<article class="ov-course" id="%s"><h3>%s</h3>%s%s%s</article>'
                % (c["slug"], html.escape(c["name"]), cert, specs, desc))
        parts.append(
            '<section class="ov-section" id="%s"><div class="ov-head"><h2>%s'
            '</h2></div>%s</section>'
            % (s["slug"], html.escape(s["name"]), "".join(rows)))
    return TEMPLATE.replace("{CSS_V}", css_v).replace("{HEADER}", header) \
        .replace("{FOOTER}", footer).replace("{JUMP}", jump) \
        .replace("{INTRO}", intro_html).replace("{SECTIONS}", "".join(parts))


TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Course Overviews | Mindful Beginnings</title>
<meta name="description" content="Full overviews of every Mindful Beginnings class: babysitting, home alone, first aid, CPR certification, and more for kids, teens, parents, and caregivers.">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/x-icon" href="/favicon.ico?v=2">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Montserrat:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/site.css?v={CSS_V}">
<style>
.ov-jump{display:flex;flex-wrap:wrap;gap:8px 22px;justify-content:center;padding:18px 6vw 4px;max-width:1080px;margin:0 auto}
.ov-jump a{font-weight:700;color:var(--navy);text-decoration:none;font-size:15px}
.ov-jump a:hover{color:#617CA3}
.ov-main{max-width:860px;margin:0 auto;padding:10px 6vw 8px}
.ov-note{font-size:16px;line-height:1.6;color:#43527A;margin:14px 0 4px}
.ov-section{margin-top:30px}
.ov-head{background:#DCE4EF;border-radius:16px;padding:16px 20px;margin:0 -18px 6px}
.ov-head h2{margin:0;font-size:clamp(24px,2.6vw,30px);font-weight:800;color:var(--navy)}
.ov-intro{font-size:16.5px;line-height:1.6;color:#33475F;margin:12px 0 2px}
.ov-course{padding:16px 0 14px;border-bottom:1px solid rgba(30,49,97,.1)}
.ov-course h3{margin:0 0 4px;font-size:21px;font-weight:800;color:var(--navy)}
.ov-cert{margin:0 0 4px;font-size:14.5px;font-weight:700;color:#ED1C24}
.ov-meta{margin:0 0 6px;font-size:14.5px;font-weight:600;color:#617CA3;line-height:1.55}
.ov-desc{margin:0;font-size:16px;line-height:1.6;color:#33475F}
.ov-band{background:var(--navy);color:#FBFAF7;padding:38px 6vw;margin-top:40px}
.ov-band-in{max-width:860px;margin:0 auto;text-align:center}
.ov-band h2{margin:0 0 8px;font-size:clamp(22px,2.4vw,28px);font-weight:800;color:#FBFAF7}
.ov-band p{margin:0 auto 18px;font-size:16.5px;line-height:1.6;max-width:620px}
.ov-band .mb-btn{margin:4px}
@media(max-width:700px){.ov-head{margin:0 -6px 6px}}
</style>
</head>
<body>
{HEADER}
<section class="mb-hero">
<div class="mb-hero-inner">
<p class="mb-eyebrow">everything we teach</p>
<h1>Course overviews</h1>
<p class="mb-lede">Full overviews of every Mindful Beginnings class, in one place. Pricing depends on the size of your group and your location, so contact us for a custom quote for your group.</p>
</div>
</section>
<nav class="ov-jump" aria-label="Sections">{JUMP}</nav>
<main class="ov-main">
{INTRO}
{SECTIONS}
</main>
<section class="ov-band"><div class="ov-band-in">
<h2>Ready to book your class?</h2>
<p>Tell us about your group and we will follow up with a custom quote and next steps for scheduling.</p>
<a class="mb-btn mb-btn-gold" href="/register.html">See upcoming classes</a>
<a class="mb-btn mb-btn-outline" href="/contact.html">Contact us</a>
</div></section>
{FOOTER}
</body>
</html>
"""


def main():
    doc = fetch_doc()
    intro_notes, sections = parse(doc)
    page = render(intro_notes, sections)
    body = page[page.index("</head>"):]
    if "$" in body:
        i = body.index("$")
        print("FAIL: a price survived stripping near: " + body[i - 60:i + 40],
              file=sys.stderr)
        return 1
    n = sum(len(s["courses"]) for s in sections)
    with open(OUT, "w") as f:
        f.write(page)
    print("wrote %s: %d sections, %d courses" % (OUT, len(sections), n))
    for s in sections:
        for c in s["courses"]:
            print("  #%s  %s" % (c["slug"], c["name"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
