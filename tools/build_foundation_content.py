#!/usr/bin/env python3
"""Build deterministic KeyLoop-owned foundation practice content."""

from __future__ import annotations

import json
from itertools import cycle, islice, product
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"


COMMON_EXTRA = """
able above across act add afraid again against age ago agree air almost along already
always among animal answer appear area ask away base become began begin behind believe
best better big body book both boy bring brought build business call came cannot car
care carry case change children city close cold company country course cut different
door early earth eat enough every example face family far father feel few find follow
food form friend full game gave general girl give given government great group grow
half hand happen hard head hear help high hold home house however idea important
include interest keep kind knew large later learn leave left life line little live
long look made man mean might miss money morning mother move much must name near need
never night often old open order own page part place point power problem public put
question read real reason remember right room run school seem service several show
side small social something sometimes sound state still story study sure system talk
tell thing thought together took toward try turn under until upon usually voice walk
water while white whole world write young account action active address allow answer
around author balance before button cancel center choose client commit common config
create current custom data default delete design detail device dialog display domain
editor enable error event export filter folder format future header hidden import
index input inside issue item label layout level limit link list local login member
method module notice object option output owner panel parent parse policy preview
profile public query recent record reduce render report request result return route
schema search section select server session shared signal source status store string
submit target task token update upload value vector visible wallet window worker
""".split()

PROGRAMMING_BASE = """
abort absolute abstract accessor adapter address aggregate allocate analytics anchor
animation api app array assert async attribute auth authorization avatar batch bigint
binary binding boolean boundary breadcrumb browser buffer bundle cache callback canonical
canvas capture cell channel checksum child chunk class client clone closure collection
column command component computed config connection constant constraint container content
context contract controller cookie coordinator crate credential cursor dashboard dataset
debounce decimal decoder default delegate dependency deploy derived dialog dispatcher
document domain draft dropdown effect element endpoint enum error event exception export
factory fallback fetch field filter fixture flag formatter fragment gateway generic guard
handler header hook hydrate identity import index input instance interceptor interface
iterator job key layout ledger lifecycle listener loader locale logger mapper matrix
memo middleware migration mock module mutation namespace node nonce observer operator
option output overlay package pagination parser payload permission pipeline portal preview
promise provider proxy queue reducer ref registry renderer repository request resolver
resource response retry route router schema selector serializer server session signal
snapshot socket source state store stream string struct subscription suspense switch
symbol table target task template token transaction transform transition trigger tuple
type union upload validator value variable variant vector view viewport virtual wallet
watcher webhook widget worker workspace wrapper
""".split()


def write_json(name: str, value: object) -> None:
    path = CONTENT / name
    path.write_text(json.dumps(value, indent=2, ensure_ascii=True) + "\n")


def unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        item = " ".join(item.split())
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def lines_from_tokens(tokens: list[str], width: int = 8, limit: int = 48) -> list[str]:
    out: list[str] = []
    token_count = len(tokens)
    for index, (left, right) in enumerate(product(tokens, tokens)):
        row = [
            left,
            right,
            tokens[(index + 2) % token_count],
            tokens[(index + 5) % token_count],
            right,
            left,
            tokens[(index + 7) % token_count],
            tokens[(index + 11) % token_count],
        ]
        out.append(" ".join(row[:width]))
        if len(out) >= limit:
            break
    return unique(out)[:limit]


def mirrored(tokens: list[str], limit: int = 48) -> list[str]:
    out: list[str] = []
    for left, right in product(tokens, tokens):
        out.append(f"{left} {right} {right[::-1]} {left[::-1]} {left} {right}")
        if len(out) >= limit:
            break
    return unique(out)[:limit]


def make_drill(drill_id: str, title_zh: str, title_en: str, hint_zh: str, hint_en: str, items: list[str]) -> dict:
    return {
        "id": drill_id,
        "title_zh": title_zh,
        "title_en": title_en,
        "hint_zh": hint_zh,
        "hint_en": hint_en,
        "items": unique(items)[:60],
    }


def foundation_drills() -> list[dict]:
    home = ["asdf", "fdsa", "jkl;", ";lkj", "af", "sj", "dk", "fl", "as", "df", "jk", "l;"]
    top = ["qwer", "rewq", "uiop", "poiu", "qr", "we", "er", "ui", "io", "op", "qw", "yu"]
    bottom = ["zxcv", "vcxz", "nm,.", ".,mn", "zx", "xc", "cv", "nm", "m,", ",.", "vb", "bn"]
    left = ["aq", "sw", "de", "fr", "ft", "fg", "fv", "za", "xs", "cd", "vr", "bt"]
    right = ["ju", "jm", "jn", "ji", "ki", "lo", "p;", "hy", "un", "ik", "ol", "m,"]
    index = ["fr", "ft", "fg", "fv", "ju", "jy", "jh", "jm", "rf", "tf", "uj", "mj"]
    middle = ["de", "ed", "ki", "ik", "dc", "cd", "i,", ",i", "ce", "ec", "k,", ",k"]
    ring = ["sw", "ws", "lo", "ol", "sx", "xs", "l.", ".l", "qw", "wq", "op", "po"]
    pinky = ["aq", "qa", "p;", ";p", "az", "za", "/;", ";/", "qz", "zq", "p/", "/p"]
    rows = ["asdfg", "sdfgh", "dfghj", "fghjk", "ghjkl", "hjkl;", "qwert", "werty", "ertyui", "rtyui", "tyuio", "yuiop", "zxcvb", "xcvbn", "cvbnm", "vbnm,"]
    columns = ["qaz", "wsx", "edc", "rfv", "tgb", "yhn", "ujm", "ik,", "ol.", "p;/"]
    diagonals = ["aqw", "swe", "der", "frt", "fty", "juy", "kiu", "lop", "zaq", "xsw", "cde", "vfr", "mju", ",ki", ".lo"]
    punctuation = [";a", "a;", "l;", ";l", "m,", ",m", "p/", "/p", "'.", ".\"", "`q", "q`"]
    transitions = ["ar", "st", "ne", "io", "th", "er", "on", "an", "re", "ed", "la", "se"]

    return [
        make_drill("home-row", "\u57fa\u7840\uff1aHome row", "Home row", "\u624b\u6307\u56de\u5230 asdf jkl;", "Anchor fingers on asdf jkl;", lines_from_tokens(home, 8, 56)),
        make_drill("top-row", "\u57fa\u7840\uff1aTop row", "Top row", "\u4e0a\u6392 qwerty uiop", "Reach into qwerty uiop", lines_from_tokens(top, 8, 56)),
        make_drill("bottom-row", "\u57fa\u7840\uff1aBottom row", "Bottom row", "\u4e0b\u6392 zxcv nm,.", "Reach into zxcv nm,.", lines_from_tokens(bottom, 8, 56)),
        make_drill("left-hand", "\u5de6\u624b\u4e13\u9879", "Left hand", "\u5de6\u624b\u5c0f\u8303\u56f4\u7a33\u5b9a", "Stabilize left-hand travel", mirrored(left, 56)),
        make_drill("right-hand", "\u53f3\u624b\u4e13\u9879", "Right hand", "\u53f3\u624b\u5c0f\u8303\u56f4\u7a33\u5b9a", "Stabilize right-hand travel", mirrored(right, 56)),
        make_drill("index-fingers", "\u98df\u6307\u7ad6\u5411", "Index columns", "\u98df\u6307\u8de8\u6392\u79fb\u52a8", "Index-finger vertical movement", mirrored(index, 56)),
        make_drill("middle-fingers", "\u4e2d\u6307\u7ad6\u5411", "Middle columns", "\u4e2d\u6307\u8de8\u6392\u79fb\u52a8", "Middle-finger vertical movement", mirrored(middle, 56)),
        make_drill("ring-fingers", "\u65e0\u540d\u6307\u7ad6\u5411", "Ring columns", "\u65e0\u540d\u6307\u8de8\u6392\u79fb\u52a8", "Ring-finger vertical movement", mirrored(ring, 56)),
        make_drill("pinky-fingers", "\u5c0f\u6307\u4e13\u9879", "Pinky keys", "\u5c0f\u6307\u4e0e\u8fb9\u7f18\u952e", "Pinky and edge keys", mirrored(pinky, 56)),
        make_drill("horizontal-rolls", "\u6a2a\u5411\u8fde\u6253", "Horizontal rolls", "\u4ece\u5de6\u5230\u53f3\u548c\u53f3\u5230\u5de6", "Left-to-right and right-to-left rolls", mirrored(rows, 56)),
        make_drill("vertical-ladders", "\u7ad6\u5411\u697c\u68af", "Vertical ladders", "\u540c\u6307\u4e0a\u4e2d\u4e0b\u8fde\u63a5", "Same-finger top-home-bottom ladders", mirrored(columns, 56)),
        make_drill("diagonal-crossovers", "\u659c\u5411\u8fc7\u6e21", "Diagonal crossovers", "\u8de8\u6392\u659c\u5411\u8fc7\u6e21", "Diagonal row transitions", mirrored(diagonals, 56)),
        make_drill("punctuation-edges", "\u8fb9\u7f18\u6807\u70b9", "Punctuation edges", "\u5206\u53f7\u3001\u9017\u53f7\u3001\u659c\u6760\u548c\u5f15\u53f7", "Semicolon, comma, slash, quotes", mirrored(punctuation, 56)),
        make_drill("english-transitions", "\u82f1\u6587\u8fc7\u6e21", "English transitions", "\u9ad8\u9891\u82f1\u6587\u5b57\u6bcd\u8fc7\u6e21", "High-frequency English transitions", mirrored(transitions, 56)),
    ]


def build_warmup(drills: list[dict]) -> list[str]:
    items: list[str] = []
    for drill in drills:
        items.extend(drill["items"][:20])
    return unique(items)[:240]


def build_word_chunks() -> list[str]:
    prefixes = "pre pro per sub super inter trans con com de dis re un in im en ex auto multi semi anti over under".split()
    suffixes = "tion sion ment ness less able ible ally ive ous ious ful ing est ary ery ure age ity ism ist".split()
    middles = "str scr spr spl squ shr thr ph ch sh th wh qu ck ng nk nt mp st tr dr fr gr br cr pr pl cl fl gl".split()
    words = "render target response request component function variable version action option section segment module context".split()
    out: list[str] = []
    for a, b in product(prefixes, suffixes):
        out.append(f"{a} {b} {a}{b} {a}{b}")
    for a, b in product(middles, words):
        out.append(f"{a} {b[:4]} {a}{b[:4]} {b}")
    return unique(out)[:420]


def build_symbols() -> list[str]:
    groups = [
        ["()", "[]", "{}", "<>", "()", "[]"],
        ["=>", "===", "!==", ">=", "<=", "??", "?."],
        ["&&", "||", "!", "!!", "?:", "::", "->"],
        ["${}", "``", "''", '""', "\\", "/", "*"],
        ["+=", "-=", "*=", "/=", "%=", "++", "--"],
        ["<T>", "<K,V>", "Record<>", "Promise<>", "Array<>"],
    ]
    out: list[str] = []
    for group in groups:
        out.extend(lines_from_tokens(group, 8, 64))
    return unique(out)[:320]


def build_number_drills() -> list[str]:
    out: list[str] = []
    for port in [3000, 3001, 4173, 5173, 8080, 8545, 8546, 9000]:
        out.append(f"localhost:{port} port {port} status 200")
    for status in [200, 201, 204, 301, 302, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503]:
        out.append(f"status {status} retry {status + 1} fallback {status - 1}")
    for major in range(1, 15):
        out.append(f"v{major}.0.0 v{major}.2.1 {major * 8}px {major * 16}px")
    for value in [16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 10000, 21000, 100000]:
        out.append(f"{value} 0x{value:x} {value // 2} {value * 2}")
    for month in range(1, 13):
        for day in [1, 7, 14, 21, 28]:
            out.append(f"2026-{month:02}-{day:02} {month:02}/{day:02} {day * 24}h")
    for gas in [21_000, 42_000, 80_000, 120_000, 250_000, 1_000_000]:
        out.append(f"gas {gas} wei {gas * 10} gwei {gas // 1000}")
    return unique(out)[:120]


def build_naming() -> list[str]:
    nouns = PROGRAMMING_BASE[:120]
    verbs = "get set load save sync fetch create update delete render parse build validate format resolve reject retry".split()
    out: list[str] = []
    for verb, noun in product(verbs, nouns):
        pascal = "".join(part.capitalize() for part in noun.split("_"))
        out.append(f"{verb}{pascal} {pascal}{verb.capitalize()} {verb}_{noun} {verb.upper()}_{noun.upper()}")
    return unique(out)[:360]


def build_programming_words() -> list[str]:
    frameworks = "react vue svelte solid nextjs nuxt remix astro vite webpack rollup esbuild swc nestjs express fastify prisma drizzle foundry hardhat openzeppelin wagmi viem ethers ratatui clap serde tokio axum tauri".split()
    methods = "map filter reduce find some every includes push pop slice splice sort flat then catch finally await async return yield match clone borrow".split()
    css = "flex grid align justify margin padding border radius shadow opacity transform transition animation container query breakpoint".split()
    verbs = "create update delete load fetch save sync render parse validate format resolve retry hydrate mount unmount".split()
    generated = []
    for verb, noun in product(verbs, PROGRAMMING_BASE[:80]):
        generated.append(f"{verb}{''.join(part.capitalize() for part in noun.split('_'))}")
        generated.append(f"{verb}_{noun}")
    return unique(PROGRAMMING_BASE + frameworks + methods + css + generated)[:900]


def build_common_words() -> list[str]:
    existing = json.loads((CONTENT / "common_words.json").read_text())
    return unique(existing + COMMON_EXTRA)[:1000]


def main() -> None:
    drills = foundation_drills()
    write_json("foundation_drills.json", drills)
    write_json("warmup.json", build_warmup(drills))
    write_json("word_chunks.json", build_word_chunks())
    write_json("common_words.json", build_common_words())
    write_json("programming_words.json", build_programming_words())
    write_json("symbols.json", build_symbols())
    write_json("number_drills.json", build_number_drills())
    write_json("naming.json", build_naming())


if __name__ == "__main__":
    main()
