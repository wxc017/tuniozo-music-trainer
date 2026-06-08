#!/usr/bin/env python3
"""Exhaustively mine solfège systems from the Xenharmonic Wiki.

Dedicated per-EDO solfège pages ("<N>edo_solfege") list SEVERAL solfège
systems each (31edo_solfege has 4).  We read them from the Wayback Machine
(xen.wiki is Cloudflare-blocked) and save the raw page + parsed tables to
data/xen-solfege/.  The registry builder then extracts every solfège column.

Usage:  python scripts/extract_xen_solfege.py            (all EDOs)
        python scripts/extract_xen_solfege.py 31 22       (subset)
"""
import json, os, sys, time
import requests
from bs4 import BeautifulSoup

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# All solfège content pages discovered via the Wayback CDX domain search.
PAGES = [
    "17edo_Solfege", "22edo_Solfege", "24edo_solfege", "29edo_solfege",
    "31edo_solfege", "41edo_solfege",
    "List_of_uniform_solfeges_for_EDOs", "List_of_uniform_solfeges_for_pergens",
    "Uniform_solfege", "Universal_solfege", "Numeric_solfege", "Microtonal_Solfege",
    "Solfege", "Solfege_string",
]
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "xen-solfege")
UA = {"User-Agent": "Mozilla/5.0 (solfege-extractor; research) Gecko/Firefox"}


def get(url, tries=5, timeout=45):
    for i in range(tries):
        try:
            r = requests.get(url, headers=UA, timeout=timeout)
            if r.status_code == 200:
                return r
            print(f"      {r.status_code} (try {i+1})")
        except Exception as e:  # noqa: BLE001
            print(f"      err {e!r} (try {i+1})")
        time.sleep(4 * (i + 1))
    return None


def latest(pageUrlKey):
    """Newest 200/text-html snapshot (timestamp, original-url) for a page."""
    cdx = (f"http://web.archive.org/cdx/search/cdx?url={pageUrlKey}"
           "&output=json&filter=statuscode:200&filter=mimetype:text/html&collapse=digest")
    r = get(cdx)
    if not r:
        return None, None
    try:
        rows = r.json()
    except Exception:  # noqa: BLE001
        return None, None
    if len(rows) < 2:
        return None, None
    snaps = sorted(rows[1:], key=lambda x: x[1])
    return snaps[-1][1], snaps[-1][2]   # timestamp, original url (keeps real case)


def table_to_obj(tbl):
    headers = []
    first = tbl.find("tr")
    if first:
        headers = [c.get_text(" ", strip=True) for c in first.find_all(["th", "td"])]
    rows = []
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
    tables = []
    for tbl in body.find_all("table"):
        prev = tbl.find_previous(["h2", "h3", "h4"])
        title = prev.get_text(" ", strip=True).replace("[edit]", "").strip() if prev else ""
        obj = table_to_obj(tbl)
        if obj["rows"]:
            obj["title"] = title
            tables.append(obj)
    return tables


def main():
    pages = sys.argv[1:] or PAGES
    os.makedirs(OUT, exist_ok=True)
    ok = 0
    for title in pages:
        key = f"en.xen.wiki/w/{title}"
        print(f"[{title}] snapshot…")
        snap, orig = latest(key)
        if not snap:
            print("  none")
            continue
        raw = f"http://web.archive.org/web/{snap}id_/{orig}"
        r = get(raw)
        if not r:
            print("  fetch failed")
            continue
        html = r.text
        tables = parse(html)
        safe = title.replace("/", "_").replace(":", "_")
        with open(os.path.join(OUT, f"{safe}.html"), "w", encoding="utf-8") as f:
            f.write(html)
        with open(os.path.join(OUT, f"{safe}.json"), "w", encoding="utf-8") as f:
            json.dump({"title": title, "snapshot": snap, "url": orig, "tables": tables}, f, indent=1, ensure_ascii=False)
        print(f"  ok — {len(tables)} tables")
        ok += 1
        time.sleep(2)
    print(f"\nDone: {ok}/{len(pages)} solfège pages -> {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
