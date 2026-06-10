#!/usr/bin/env python3
"""Fetch VOA Learning English articles as corpus candidates.

Collects article URLs from several section pages, extracts title and body
paragraphs, strips media placeholders / share chrome / the vocabulary list,
and writes candidates to /tmp/voa_candidates.json for gating + translation.
"""
import json
import re
import subprocess
import sys

SECTIONS = {
    "as-it-is": "https://learningenglish.voanews.com/z/3521",
    "sci-tech": "https://learningenglish.voanews.com/z/1579",
    "health": "https://learningenglish.voanews.com/z/955",
    "arts": "https://learningenglish.voanews.com/z/986",
    "words-stories": "https://learningenglish.voanews.com/z/987",
    "american-stories": "https://learningenglish.voanews.com/z/1581",
    "education-tips": "https://learningenglish.voanews.com/z/7468",
}

STOP_MARKERS = [
    "words in this story",
    "quiz -",
    "what do you think",
    "we want to hear from you",
]
NOISE = [
    "no media source",
    "see comments",
    "follow us",
    "share",
    "print",
    "embed",
    "the url has been copied",
    "the code has been copied",
]
BYLINE = re.compile(
    r"^(i'm\s|and i'm\s|.*(reported|wrote|adapted) (this story|it) for (voa )?learning english)",
    re.I,
)
AGENCY = re.compile(r"(associated press|reuters|agence france|afp)", re.I)


def fetch(url: str) -> str:
    out = subprocess.run(
        ["curl", "-sL", "--max-time", "60", url],
        capture_output=True, text=True, timeout=90,
    )
    return out.stdout


def clean_text(html: str) -> str:
    t = re.sub(r"<[^>]+>", " ", html)
    t = t.replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'")
    t = t.replace("&ldquo;", '"').replace("&rdquo;", '"')
    t = t.replace("&lsquo;", "'").replace("&rsquo;", "'")
    t = t.replace("&nbsp;", " ").replace("&mdash;", " - ").replace("&ndash;", "-")
    t = t.replace("‘", "'").replace("’", "'")
    t = t.replace("“", '"').replace("”", '"')
    t = t.replace("—", " - ").replace("–", "-").replace("…", "...")
    return re.sub(r"\s+", " ", t).strip()


def extract(url: str):
    html = fetch(url)
    tm = re.search(r"<title>([^<]+)</title>", html)
    title = clean_text(tm.group(1)) if tm else ""
    title = re.sub(r"\s*-\s*(VOA.*|Voice of America.*)$", "", title).strip()
    i = html.find('class="wsw"')
    if i < 0:
        return None
    chunk = html[i:]
    paras = []
    for p in re.findall(r"<p[^>]*>([\s\S]*?)</p>", chunk):
        t = clean_text(p)
        low = t.lower()
        if not t or len(t) < 25:
            continue
        if any(m in low for m in STOP_MARKERS):
            break
        if any(n == low or low.startswith(n) for n in NOISE):
            continue
        if BYLINE.match(low):
            break
        paras.append(t)
    if AGENCY.search(" ".join(paras[:2])):
        return None  # likely wire-agency content, not VOA original
    return {"url": url, "title": title, "paragraphs": paras}


def main():
    urls = {}
    for section, page in SECTIONS.items():
        html = fetch(page)
        for m in re.findall(r'href="(/a/[^"]+\.html)"', html):
            full = "https://learningenglish.voanews.com" + m
            urls.setdefault(full, section)
    print(f"collected {len(urls)} article urls", file=sys.stderr)

    candidates = []
    for n, (url, section) in enumerate(urls.items()):
        try:
            art = extract(url)
        except Exception as e:
            print(f"skip {url}: {e}", file=sys.stderr)
            continue
        if art is None or len(art["paragraphs"]) < 3:
            continue
        words = sum(len(p.split()) for p in art["paragraphs"])
        if words < 80:
            continue
        art["section"] = section
        art["word_count"] = words
        candidates.append(art)
        print(f"[{len(candidates)}] {art['title'][:60]} ({words}w, {section})", file=sys.stderr)

    json.dump(candidates, open("/tmp/voa_candidates.json", "w"), ensure_ascii=False)
    print(f"wrote {len(candidates)} candidates", file=sys.stderr)


if __name__ == "__main__":
    main()
