"""Zoom wording for shared course overview pages.

The in-person page stays the default. ?format=virtual hides .ov-inperson
and shows .ov-virtual. Ready. Period. virtual keeps the four at-home
items (one pad, a glass of water, a large spoon, and a towel). The other
virtual classes do not ask students to bring materials.

build-overview-pages.py calls patch_page after each Drive render so a
later sync does not drop the Zoom view. Re-running on an already patched
file is a no-op.
"""
import sys

MARKER = "data-overview-format"

HEAD_CSS = (
    "html:not([data-overview-format=\"virtual\"]) .ov-virtual{display:none}\n"
    "html[data-overview-format=\"virtual\"] .ov-inperson{display:none}\n"
)

HEAD_SCRIPT = (
    "<script>\n"
    "(function(){try{if(new URLSearchParams(location.search).get('format')==='virtual')"
    "{document.documentElement.setAttribute('data-overview-format','virtual');}}"
    "catch(e){}})();\n"
    "</script>\n"
)

VIRTUAL_SLUGS = (
    "safe-at-home",
    "stay-ready",
    "season-ready",
    "ready-period",
    "social-ready",
)


def must_replace(page, old, new, slug):
    if old not in page:
        raise SystemExit("FAIL %s: overview anchor missing, virtual format not applied" % slug)
    return page.replace(old, new, 1)


def ensure_head(page):
    if MARKER in page:
        return page
    if "</style>" not in page or "</head>" not in page:
        raise SystemExit("FAIL overview page is missing head markers")
    page = page.replace("</style>", HEAD_CSS + "</style>", 1)
    page = page.replace("</head>", HEAD_SCRIPT + "</head>", 1)
    return page


def wrap_main(page, virtual_html, slug):
    start_tag = '<main class="ov-main">'
    end_tag = '<a class="ov-back"'
    start = page.find(start_tag)
    end = page.find(end_tag)
    if start < 0 or end < 0 or end < start:
        raise SystemExit("FAIL %s: could not wrap the overview body" % slug)
    start += len(start_tag)
    inner = page[start:end]
    if 'class="ov-inperson"' in inner or 'class="ov-virtual"' in inner:
        raise SystemExit("FAIL %s: overview body was already split" % slug)
    wrapped = (
        '\n<div class="ov-inperson">'
        + inner.rstrip()
        + "\n</div>\n"
        + virtual_html
        + "\n"
    )
    return page[:start] + wrapped + page[end:]


def patch_safe_at_home(page):
    slug = "safe-at-home"
    page = must_replace(
        page,
        '<main class="ov-main">\n',
        '<main class="ov-main">\n'
        '<p class="ov-p ov-virtual"><strong>Virtual class.</strong> '
        'Students join a live Zoom class from home with a device and a camera. '
        'There are no class materials to bring and no hands-on kit.\n'
        '</p>\n',
        slug,
    )
    page = must_replace(
        page,
        '<tr><th scope="row">LENGTH</th><td>Ninety minutes, taught in one sitting</td></tr>',
        '<tr><th scope="row">LENGTH</th><td>'
        '<span class="ov-inperson">Ninety minutes, taught in one sitting</span>'
        '<span class="ov-virtual">60 minutes, live on Zoom</span>'
        '</td></tr>',
        slug,
    )
    page = must_replace(
        page,
        '<p class="ov-p">A Safe@Home student booklet for every student to keep\n'
        '</p>\n'
        '<p class="ov-p">All class materials brought to your home, school or meeting space\n'
        '</p>',
        '<p class="ov-p ov-inperson">A Safe@Home student booklet for every student to keep\n'
        '</p>\n'
        '<p class="ov-p ov-inperson">All class materials brought to your home, school or meeting space\n'
        '</p>\n'
        '<p class="ov-p ov-virtual">No class materials. A device and a camera for Zoom are enough.\n'
        '</p>\n'
        '<p class="ov-p ov-virtual">A completion card, mailed or emailed after class\n'
        '</p>',
        slug,
    )
    return page


def patch_stay_ready(page):
    virtual = """<div class="ov-virtual">
<p class="ov-p"><strong>Choking Rescue, CPR Review and Seizure Response</strong></p>
<p class="ov-p"><strong>Virtual class.</strong> Students who already know these skills join a live Zoom class. They use a device and a camera. There is no hands-on practice and no class materials to bring.</p>
<h3 class="ov-h3"><strong>AT A GLANCE</strong></h3>
<table class="ov-table"><tr><th scope="row">WHO IT IS FOR</th><td>Graduates of a babysitting course</td></tr><tr><th scope="row">FORMAT</th><td>Live on Zoom</td></tr><tr><th scope="row">TAUGHT BY</th><td>Certified teachers and registered nurses</td></tr></table>
<h3 class="ov-h3"><strong>WHAT THE CLASS COVERS</strong></h3>
<p class="ov-p">Updated choking rescue steps for infants and children</p>
<p class="ov-p">A CPR review: depth, rate, and hand position, shown on screen</p>
<p class="ov-p">What to do when a choking child becomes unresponsive</p>
<p class="ov-p">Seizure first aid: stay, time, safe, side, cushion</p>
<p class="ov-p">When to call 9-1-1</p>
<p class="ov-p">Real world emergency scenarios, talked through together</p>
<h3 class="ov-h3"><strong>WHAT IS INCLUDED</strong></h3>
<p class="ov-p">A certified teacher or registered nurse as your instructor</p>
<p class="ov-p">No class materials. A device and a camera are enough.</p>
<h3 class="ov-h3"><strong>A NOTE ON THIS COURSE</strong></h3>
<p class="ov-p">Stay Ready is a refresher, not a certification class. It keeps skills current, but it does not renew a certification. Students should renew through the course that originally certified them.</p>
<p class="ov-p">On Zoom, the nurse teaches the steps and the latest updates. Students watch and talk through the steps. They do not bring class materials.</p>
</div>"""
    return wrap_main(page, virtual, "stay-ready")


def patch_season_ready(page):
    slug = "season-ready"
    page = must_replace(
        page,
        '<p class="ov-p">Most of what limits a young athlete is not talent. It is an underfueled body, a lack of recovery, and a culture that treats reporting pain as weakness. <strong>Season Ready</strong> is a 60 minute, hands-on workshop taught by a Registered Nurse to help middle and high school athletes stay healthy, perform at their peak, and handle critical emergencies.\n'
        '</p>\n'
        '<p class="ov-p">Our RNs bring all materials directly to your team, athletic department, club, or parent hosted group. Every student practices hands-on. Nobody just watches.\n'
        '</p>',
        '<p class="ov-p ov-inperson">Most of what limits a young athlete is not talent. It is an underfueled body, a lack of recovery, and a culture that treats reporting pain as weakness. <strong>Season Ready</strong> is a 60 minute, hands-on workshop taught by a Registered Nurse to help middle and high school athletes stay healthy, perform at their peak, and handle critical emergencies.\n'
        '</p>\n'
        '<p class="ov-p ov-virtual">Most of what limits a young athlete is not talent. It is an underfueled body, a lack of recovery, and a culture that treats reporting pain as weakness. <strong>Season Ready</strong> is a 60 minute live Zoom class taught by a Registered Nurse to help middle and high school athletes stay healthy, perform at their peak, and know how to respond in an emergency.\n'
        '</p>\n'
        '<p class="ov-p ov-inperson">Our RNs bring all materials directly to your team, athletic department, club, or parent hosted group. Every student practices hands-on. Nobody just watches.\n'
        '</p>\n'
        '<p class="ov-p ov-virtual"><strong>Virtual class.</strong> Students join from home with a device and a camera. The nurse teaches on Zoom. Students do not bring class materials.\n'
        '</p>',
        slug,
    )
    page = must_replace(
        page,
        '<td>Emergency Response Hands-on practice with hands-only CPR manikins, AED trainers, rapid cooling for heat stroke, and real world concussion scenarios.</td>',
        '<td><span class="ov-inperson">Emergency Response Hands-on practice with hands-only CPR manikins, AED trainers, rapid cooling for heat stroke, and real world concussion scenarios.</span>'
        '<span class="ov-virtual">Emergency Response The nurse teaches how to recognize cardiac arrest, heat stroke, and concussion, and walks through the response steps on screen.</span></td>',
        slug,
    )
    page = must_replace(
        page,
        '<tr><th scope="row">FORMAT</th><td>60 minute interactive workshop</td></tr>',
        '<tr><th scope="row">FORMAT</th><td>'
        '<span class="ov-inperson">60 minute interactive workshop</span>'
        '<span class="ov-virtual">60 minute live Zoom class. A device and a camera. No class materials.</span>'
        '</td></tr>',
        slug,
    )
    page = must_replace(
        page,
        '<tr><th scope="row">LOCATION</th><td>We come to you</td></tr>',
        '<tr><th scope="row">LOCATION</th><td>'
        '<span class="ov-inperson">We come to you</span>'
        '<span class="ov-virtual">Live on Zoom</span>'
        '</td></tr>',
        slug,
    )
    return page


def patch_ready_period(page):
    virtual = """<div class="ov-virtual">
<p class="ov-p"><strong>A Puberty Prep Workshop for Girls</strong></p>
<p class="ov-p"><strong>Grades 5, 6 and 7 · Girls · Live on Zoom</strong></p>
<p class="ov-p"><strong>Virtual class.</strong> A registered nurse teaches this live on Zoom. Girls join from home with a device and a camera.</p>
<p class="ov-p"><strong>Have these ready before class:</strong> one pad, a glass of water, a large spoon, and a towel. The same list is in the family reminder before the session.</p>
<p class="ov-p"><strong>At a Glance</strong></p>
<table class="ov-table"><tr><th scope="row">WHO IT IS FOR</th><td>Girls in grades 5, 6 and 7</td></tr><tr><th scope="row">FORMAT</th><td>One live Zoom workshop</td></tr><tr><th scope="row">GROUP SIZE</th><td>6 to 18 participants</td></tr><tr><th scope="row">TAUGHT BY</th><td>A registered nurse</td></tr><tr><th scope="row">WHERE</th><td>Live on Zoom</td></tr><tr><th scope="row">HAVE READY</th><td>One pad, a glass of water, a large spoon, and a towel</td></tr></table>
<p class="ov-p"><strong>What We Cover</strong></p>
<p class="ov-p"><strong>Body changes and timelines</strong></p>
<p class="ov-p">Why everyone is on a different schedule, and why that is normal</p>
<p class="ov-p">Breast development, body hair, skin and sweat</p>
<p class="ov-p">The early sign almost nobody talks about</p>
<p class="ov-p"><strong>What a period is really like</strong></p>
<p class="ov-p">What a first period actually looks and feels like</p>
<p class="ov-p">How much blood it really is</p>
<p class="ov-p">Cramps and what helps</p>
<p class="ov-p">What to do if it starts at school</p>
<p class="ov-p"><strong>Products, explained on screen</strong></p>
<p class="ov-p">The nurse shows how pads, liners, tampons, period underwear, and menstrual cups work.</p>
<p class="ov-p">Girls use the one pad they have at home, with the glass of water, large spoon, and towel.</p>
<p class="ov-p">No pressure: product choices are a family decision</p>
<p class="ov-p"><strong>Care and confidence</strong></p>
<p class="ov-p">Simple hygiene that actually matters</p>
<p class="ov-p">Handling comparison and unkind comments</p>
<p class="ov-p">Moods, sleep and big feelings</p>
<p class="ov-p">Choosing a trusted adult to talk to</p>
<p class="ov-p">When something is worth a call to the doctor</p>
<p class="ov-p"><strong>What Is Included</strong></p>
<p class="ov-p">A registered nurse for the workshop</p>
<p class="ov-p">Questions in the Zoom chat</p>
<p class="ov-p">A letter for parents, sent after class</p>
<p class="ov-p"><strong>A Note on This Workshop</strong></p>
<p class="ov-p">Ready. Period. on Zoom is a live workshop with a registered nurse. She shares what is typical and when something is worth a conversation with a parent and doctor. She does not diagnose, examine, or give individual medical advice, and no girl is asked about her own development.</p>
</div>"""
    return wrap_main(page, virtual, "ready-period")


def patch_social_ready(page):
    slug = "social-ready"
    page = must_replace(
        page,
        '<main class="ov-main">\n',
        '<main class="ov-main">\n'
        '<p class="ov-p ov-virtual"><strong>Virtual class.</strong> '
        'Students join from home with a device and a camera. '
        'They do not bring class materials. A parent or organizer stays on the call.\n'
        '</p>\n',
        slug,
    )
    page = must_replace(
        page,
        '<tr><th scope="row">IN PERSON</th><td>We come to you anywhere within 60 miles of Washington, DC, and we bring everything</td></tr>',
        '<tr class="ov-inperson"><th scope="row">IN PERSON</th><td>We come to you anywhere within 60 miles of Washington, DC, and we bring everything</td></tr>',
        slug,
    )
    return page


PATCHERS = {
    "safe-at-home": patch_safe_at_home,
    "stay-ready": patch_stay_ready,
    "season-ready": patch_season_ready,
    "ready-period": patch_ready_period,
    "social-ready": patch_social_ready,
}


def patch_page(page, slug):
    if slug not in PATCHERS:
        return page
    if MARKER in page:
        return page
    page = ensure_head(page)
    page = PATCHERS[slug](page)
    if "ov-virtual" not in page or MARKER not in page:
        raise SystemExit("FAIL %s: virtual overview block missing" % slug)
    return page


def main(argv):
    for slug in argv or VIRTUAL_SLUGS:
        path = "course-overviews/%s.html" % slug
        with open(path) as f:
            page = f.read()
        patched = patch_page(page, slug)
        if patched != page:
            with open(path, "w") as f:
                f.write(patched)
            print("patched", slug)
        else:
            print("unchanged", slug)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
