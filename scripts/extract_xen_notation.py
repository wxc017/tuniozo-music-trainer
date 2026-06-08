#!/usr/bin/env python3
"""Extract every EDO's notation systems from the Xenharmonic Wiki.

en.xen.wiki is behind Cloudflare (403 to bots), so we read each page from the
Internet Archive's Wayback Machine instead:
  1. CDX API  → list of 200-status snapshots for en.xen.wiki/w/<N>edo
  2. fetch the newest snapshot's RAW html  (the `<ts>id_/` form = no archive
     toolbar injected, so the markup is the original page)
  3. parse out the interval tables (these carry the interval names + their
     notation suffixes, one column per notation system) and the Notation /
     Chord / Harmony prose sections.

Outputs, per EDO, into  data/xen-notation/ :
  <N>edo.html   raw archived page
  <N>edo.json   { edo, snapshot, sections:[{heading,level,text}],
                  tables:[{title, headers, rows}] }
  <N>edo.md     human-readable digest (headings + tables as markdown)
And a combined  _index.md  listing what was captured per EDO.

Usage:  python scripts/extract_xen_notation.py            (all EDOs)
        python scripts/extract_xen_notation.py 31 50 41   (subset)
"""
import json, os, re, sys, time, urllib.parse
import requests
from bs4 import BeautifulSoup

# Windows consoles default to cp1252 and choke on ✓ / … — force UTF-8 output.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass

EDOS = [5, 7, 12, 17, 19, 22, 26, 27, 29, 31, 32, 33, 34, 35, 37, 39, 40, 41,
        43, 45, 46, 47, 49, 50, 53, 55, 56, 63, 80, 81, 94]

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "xen-notation")
UA = {"User-Agent": "Mozilla/5.0 (notation-extractor; research) Gecko/Firefox"}
# Notation-related headings we especially want to flag in the digest.
NOTATION_HINT = re.compile(r"notation|interval|chord|harmon|ups? and downs|"
                           r"sagittal|skulo|accidental|degree|solfege|naming",
                           re.I)


def get(url, tries=5, timeout=45):
    """GET with retries — the Wayback CDX / replay 503s under load."""
    for i in range(tries):
        try:
            r = requests.get(url, headers=UA, timeout=timeout)
            if r.status_code == 200:
                return r
            print(f"      {r.status_code} (try {i+1}) {url[:70]}")
        except Exception as e:  # noqa: BLE001
            print(f"      err {e!r} (try {i+1})")
        time.sleep(4 * (i + 1))
    return None


def latest_snapshot(edo):
    """Newest 200/text-html Wayback snapshot timestamp for the EDO page."""
    cdx = ("http://web.archive.org/cdx/search/cdx?url=en.xen.wiki/w/"
           f"{edo}edo&output=json&filter=statuscode:200&"
           "filter=mimetype:text/html&collapse=digest")
    r = get(cdx)
    if not r:
        return None
    try:
        rows = r.json()
    except Exception:  # noqa: BLE001
        return None
    if len(rows) < 2:
        return None
    # rows[0] is the header; timestamp is column 1.  Take the max (newest).
    snaps = sorted(rows[1:], key=lambda x: x[1])
    return snaps[-1][1]


def table_to_obj(tbl):
    headers, rows = [], []
    head_cells = tbl.select("tr th")
    if head_cells:
        headers = [c.get_text(" ", strip=True) for c in tbl.find("tr").find_all(["th", "td"])]
    for tr in tbl.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if not cells:
            continue
        vals = [c.get_text(" ", strip=True) for c in cells]
        if vals == headers:
            continue
        if any(v for v in vals):
            rows.append(vals)
    return {"headers": headers, "rows": rows}


def parse(html):
    soup = BeautifulSoup(html, "html.parser")
    body = soup.select_one(".mw-parser-output") or soup.body or soup
    # Sections: walk headings, collect following prose until the next heading.
    sections = []
    for h in body.find_all(["h2", "h3", "h4"]):
        title = h.get_text(" ", strip=True).replace("[edit]", "").strip()
        parts = []
        for sib in h.find_all_next():
            if sib.name in ("h2", "h3", "h4"):
                break
            if sib.name == "p":
                t = sib.get_text(" ", strip=True)
                if t:
                    parts.append(t)
        text = "\n".join(parts[:8])
        sections.append({"heading": title, "level": int(h.name[1]), "text": text})
    # Tables: title = nearest preceding heading text.
    tables = []
    for tbl in body.find_all("table"):
        prev = tbl.find_previous(["h2", "h3", "h4"])
        title = prev.get_text(" ", strip=True).replace("[edit]", "").strip() if prev else ""
        obj = table_to_obj(tbl)
        if obj["rows"]:
            obj["title"] = title
            tables.append(obj)
    return sections, tables


def md_digest(edo, snap, sections, tables):
    out = [f"# {edo}-EDO — Xenharmonic Wiki notation",
           f"_snapshot {snap} · https://en.xen.wiki/w/{edo}edo_\n"]
    notation_secs = [s for s in sections if NOTATION_HINT.search(s["heading"])]
    if notation_secs:
        out.append("## Notation-related sections\n")
        for s in notation_secs:
            out.append(f"### {s['heading']}")
            if s["text"]:
                out.append(s["text"])
            out.append("")
    out.append("## Tables (interval names + notation suffixes)\n")
    for t in tables:
        out.append(f"### {t.get('title','(table)')}")
        if t["headers"]:
            out.append("| " + " | ".join(t["headers"]) + " |")
            out.append("|" + "|".join(["---"] * len(t["headers"])) + "|")
        for row in t["rows"][:80]:
            out.append("| " + " | ".join(row) + " |")
        out.append("")
    return "\n".join(out)


def main():
    edos = [int(a) for a in sys.argv[1:]] or EDOS
    os.makedirs(OUT, exist_ok=True)
    index = ["# Xenharmonic Wiki notation extraction\n",
             "| EDO | snapshot | sections | tables |", "|---|---|---|---|"]
    ok = 0
    for edo in edos:
        print(f"[{edo}edo] finding snapshot…")
        snap = latest_snapshot(edo)
        if not snap:
            print(f"  no snapshot for {edo}edo")
            index.append(f"| {edo} | — | — | — |")
            continue
        raw = (f"http://web.archive.org/web/{snap}id_/"
               f"https://en.xen.wiki/w/{edo}edo")
        print(f"  fetching {snap}…")
        r = get(raw)
        if not r:
            print(f"  fetch failed for {edo}edo")
            index.append(f"| {edo} | {snap} | FETCH FAIL | — |")
            continue
        html = r.text
        with open(os.path.join(OUT, f"{edo}edo.html"), "w", encoding="utf-8") as f:
            f.write(html)
        sections, tables = parse(html)
        with open(os.path.join(OUT, f"{edo}edo.json"), "w", encoding="utf-8") as f:
            json.dump({"edo": edo, "snapshot": snap,
                       "url": f"https://en.xen.wiki/w/{edo}edo",
                       "sections": sections, "tables": tables}, f, indent=1, ensure_ascii=False)
        with open(os.path.join(OUT, f"{edo}edo.md"), "w", encoding="utf-8") as f:
            f.write(md_digest(edo, snap, sections, tables))
        print(f"  ✓ {len(sections)} sections, {len(tables)} tables")
        index.append(f"| {edo} | {snap} | {len(sections)} | {len(tables)} |")
        ok += 1
        time.sleep(2)  # be polite to the Wayback Machine
    with open(os.path.join(OUT, "_index.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(index))
    print(f"\nDone: {ok}/{len(edos)} EDOs → {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
