use crate::model::{
    DailyPracticePlan, LessonKind, Mode, PracticeLesson, PracticeTarget, SessionRecord,
};
use crate::plan::PracticePlan;
use anyhow::{Context, Result};
use chrono::Local;
use ignore::WalkBuilder;
use rand::seq::SliceRandom;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

const WORDS: &[&str] = &[
    "return",
    "const",
    "let",
    "var",
    "function",
    "import",
    "export",
    "default",
    "async",
    "await",
    "value",
    "result",
    "state",
    "props",
    "event",
    "target",
    "current",
    "request",
    "response",
    "error",
    "message",
    "component",
    "children",
    "items",
    "index",
    "length",
    "button",
    "input",
    "form",
    "submit",
    "change",
    "click",
    "useState",
    "useEffect",
    "useRef",
    "useMemo",
    "useCallback",
    "className",
    "onClick",
    "onChange",
    "onSubmit",
    "preventDefault",
    "querySelector",
    "addEventListener",
    "selected",
    "selectedType",
    "visible",
    "enabled",
    "disabled",
    "pending",
    "loading",
    "resolved",
    "rejected",
    "payload",
    "params",
    "query",
    "router",
    "pathname",
    "searchParams",
    "dataset",
    "attribute",
    "container",
    "wrapper",
    "sidebar",
    "dropdown",
    "popover",
    "tooltip",
    "viewport",
    "breakpoint",
    "stylesheet",
    "animation",
    "transition",
    "transform",
    "translate",
    "opacity",
    "background",
    "foreground",
    "contract",
    "address",
    "account",
    "balance",
    "transfer",
    "approve",
    "allowance",
];

const COMMON_ENGLISH_WORDS: &[&str] = &[
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on",
    "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say",
    "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what", "so",
    "up", "out", "if", "about", "who", "get", "which", "go", "me", "when", "make", "can", "like",
    "time", "no", "just", "him", "know", "take", "people", "into", "year", "your", "good", "some",
    "could", "them", "see", "other", "than", "then", "now", "look", "only", "come", "its", "over",
    "think", "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
    "even", "new", "want", "because", "any", "these", "give", "day", "most", "us", "is", "are",
    "was", "were", "been", "has", "had", "did", "more", "very", "many", "much", "before",
    "through", "where", "why", "same", "great", "small", "large", "every", "under", "place",
    "again", "around", "right", "still", "try", "old", "each", "own", "too", "last", "long",
    "little", "house", "world", "life", "part", "number", "call", "find", "write", "water", "side",
    "word", "mean", "tell", "move", "turn", "point", "group", "problem", "fact", "hand", "eye",
    "ask", "need", "feel", "become", "leave", "put", "keep", "let", "begin", "seem", "help",
    "talk", "turn", "start", "show", "hear", "play", "run", "move", "live", "believe", "bring",
    "happen", "must", "might", "should", "never", "always", "often", "once", "together",
];

const CHAR_DRILLS: &[&str] = &[
    "asdf jkl; asdf jkl; fdsa ;lkj",
    "asdf fdsa jkl; ;lkj af sj dk fl",
    "fg fg fg fg gf gf gf gf",
    "fr fr fr fr rf rf rf rf",
    "ft ft ft ft tf tf tf tf",
    "fv fv fv fv vf vf vf vf",
    "ju ju ju ju uj uj uj uj",
    "jm jm jm jm mj mj mj mj",
    "jn jn jn jn nj nj nj nj",
    "hy hy hy hy yh yh yh yh",
    "aq aq aq aq qa qa qa qa",
    "sw sw sw sw ws ws ws ws",
    "de de de de ed ed ed ed",
    "ki ki ki ki ik ik ik ik",
    "lo lo lo lo ol ol ol ol",
    "pl pl pl pl lp lp lp lp",
    "qwer uiop qwer uiop rewq poiu",
    "qaz wsx edc rfv tgb yhn ujm ik, ol.",
    "zxcv nm,. zxcv nm,. vcxz .,mn",
    "fr ft fv fg jr ju jm jn",
    "de ed re er th ht in ni on no",
    "la al se es te et io oi un nu",
    "left right left right home row home row",
];

const WORD_CHUNKS: &[&str] = &[
    "the tha thi tho thu th",
    "and end ind ond und hand send find",
    "all ell ill oll ull call tell will",
    "are ere ire ore ure care here fire",
    "ate ete ite ote ute state delete write",
    "est ast ist ost ust test fast list",
    "tion sion cion ation ition",
    "tial cial ntion stion action option",
    "ing ang ong ung ring sing bring",
    "ight light right night might",
    "ound round sound found ground",
    "ough though through enough rough",
    "ent ant ment mentation",
    "ive tive sive active native passive",
    "able ible table stable visible",
    "ally illy elly really finally",
    "ness less ful useful endless brightness",
    "pre pro per prepare process perform",
    "sub sup sur super support surface",
    "over under after before between",
    "re un in dis return undo input display",
    "mis non anti auto semi multi",
    "con com col cor const component collect correct",
    "inter intra trans trace trade trigger",
    "de di da do du data define divide",
    "ex en em enter export enable",
    "str spr scr stretch spread screen",
    "spl squ shr throw shrink square",
    "tr dr fr gr br cr trace drive frame group",
    "pr pl cl fl gl produce place class flow",
    "ch sh th wh qu chain show theme where query",
    "ck ng nk mp nt st back long link jump",
    "igh ough augh right through caught",
    "ous ious eous serious previous",
    "ful less ness useful endless brightness",
    "er or ar re render error target response",
    "tion ment ness able ing ed er ly",
    "com con pro pre re de un in",
    "sta sti sto str start still story string",
    "par per por pur parent person portal",
    "ter tor tar ture return factor target",
];

const NUMBER_DRILLS: &[&str] = &[
    "1234 5678 90 0987 6543 21",
    "2026 1000 404 200 500 301 302",
    "0 1 2 3 5 8 13 21 34 55",
    "index 0 length 1 page 2 count 10",
    "const limit = 100; const page = 1;",
    "items.slice(0, 10).map((item) => item.id)",
];

const CASE_DRILLS: &[&str] = &[
    "React TypeScript JavaScript CSS HTML JSON DOM API",
    "useState setState useEffect useMemo useCallback",
    "onClick onChange onSubmit preventDefault",
    "URLSearchParams HTMLInputElement MouseEvent",
    "const API_URL = process.env.NEXT_PUBLIC_API_URL;",
    "selectedType setSelectedType SortingState",
    "HTMLButtonElement CSSProperties ResizeObserver",
    "NEXT_PUBLIC_CHAIN_ID VITE_API_BASE_URL",
];

const SYMBOLS: &[&str] = &[
    "()",
    "[]",
    "{}",
    "<>",
    "''",
    "\"\"",
    "``",
    "=>",
    "===",
    "!==",
    "&&",
    "||",
    ">=",
    "<=",
    "${}",
    "?.",
    "??",
    "_",
    "-",
    ";",
    ":",
    ",",
    ".",
    "/",
    "\\",
    "() => {}",
    "!== null",
    "&& value",
    "const value = \"\";",
    "items.map((item) => item.id)",
];

const CODE_SNIPPETS: &[&str] = &[
    "const result = items.map((item) => item.id);",
    "if (value !== null && value !== \"\") {\n  return value;\n}",
    "const [state, setState] = useState(0);",
    "export default function App() {\n  return <div>{title}</div>;\n}",
    "button.addEventListener(\"click\", handleClick);",
    "const nextItems = items.filter((item) => item.enabled);",
    "setState((current) => ({ ...current, value }));",
    "const selected = options.find((option) => option.value === value);\nreturn selected?.label ?? \"\";",
    "const visibleItems = items.filter((item) => {\n  return item.enabled && item.type === selectedType;\n});",
    "function formatAddress(address: string) {\n  return `${address.slice(0, 6)}...${address.slice(-4)}`;\n}",
    "async function loadProfile(account: string) {\n  const response = await fetch(`/api/profile?account=${account}`);\n  return response.json();\n}",
    "export function Button({ children, disabled }: ButtonProps) {\n  return <button disabled={disabled}>{children}</button>;\n}",
    "const style = {\n  display: \"grid\",\n  gridTemplateColumns: \"repeat(2, minmax(0, 1fr))\",\n};",
    "mapping(address => uint256) public balanceOf;\n\nfunction transfer(address to, uint256 amount) public returns (bool) {\n  balanceOf[msg.sender] -= amount;\n  balanceOf[to] += amount;\n  return true;\n}",
    ".card {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n}",
    "<button class=\"primary\" type=\"button\">\n  <span>Connect wallet</span>\n</button>",
    "const handleChange = (event: ChangeEvent<HTMLInputElement>) => {\n  setValue(event.currentTarget.value);\n};",
    "const total = cart.items.reduce((sum, item) => {\n  return sum + item.price * item.quantity;\n}, 0);",
    "const isSelected = selectedIds.includes(item.id);\nconst className = isSelected ? \"item active\" : \"item\";",
    "useEffect(() => {\n  document.title = title;\n}, [title]);",
    "const filtered = items.filter((item) => {\n  return item.name.toLowerCase().includes(query.toLowerCase());\n});",
    "const sorted = [...items].sort((a, b) => {\n  return a.createdAt.localeCompare(b.createdAt);\n});",
    "function getInitials(name: string) {\n  return name.split(\" \").map((part) => part[0]).join(\"\");\n}",
    "async function submitForm(values: FormValues) {\n  setPending(true);\n  await saveSettings(values);\n  setPending(false);\n}",
    "export function useToggle(initial = false) {\n  const [enabled, setEnabled] = useState(initial);\n  return [enabled, () => setEnabled((value) => !value)] as const;\n}",
    "type ButtonVariant = \"primary\" | \"secondary\" | \"ghost\";\n\ninterface ButtonProps {\n  variant?: ButtonVariant;\n  disabled?: boolean;\n}",
    "const routes = [\n  { path: \"/\", label: \"Home\" },\n  { path: \"/settings\", label: \"Settings\" },\n];",
    "for (const item of items) {\n  if (!item.enabled) continue;\n  selectedIds.add(item.id);\n}",
    "try {\n  const result = await client.request(payload);\n  return result.data;\n} catch (error) {\n  reportError(error);\n}",
    "function reducer(state: State, action: Action): State {\n  switch (action.type) {\n    case \"reset\":\n      return initialState;\n    default:\n      return state;\n  }\n}",
    "const button = document.querySelector<HTMLButtonElement>(\"button[data-submit]\");\nbutton?.addEventListener(\"click\", handleSubmit);",
    "const params = new URLSearchParams(location.search);\nconst page = Number(params.get(\"page\") ?? \"1\");",
    "grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));\ngap: clamp(12px, 2vw, 24px);",
    ".button:hover {\n  transform: translateY(-1px);\n  background: var(--button-hover);\n}",
    ".panel {\n  padding: 16px;\n  border: 1px solid var(--border);\n  border-radius: 8px;\n}",
    "@media (min-width: 768px) {\n  .layout {\n    grid-template-columns: 240px 1fr;\n  }\n}",
    "@mixin focus-ring($color) {\n  outline: 2px solid $color;\n  outline-offset: 2px;\n}",
    ".card {\n  &__title {\n    font-weight: 600;\n  }\n}",
    "@primary-color: #2563eb;\n.button {\n  color: white;\n  background: @primary-color;\n}",
    "<form class=\"stack\" method=\"post\">\n  <label for=\"email\">Email</label>\n  <input id=\"email\" name=\"email\" type=\"email\" />\n</form>",
    "<section class=\"hero\">\n  <h1>Dashboard</h1>\n  <p>Track activity and recent changes.</p>\n</section>",
    "pragma solidity ^0.8.20;\n\ncontract Counter {\n  uint256 public count;\n\n  function increment() public {\n    count += 1;\n  }\n}",
    "event Transfer(address indexed from, address indexed to, uint256 value);\n\nfunction emitTransfer(address to, uint256 value) internal {\n  emit Transfer(msg.sender, to, value);\n}",
    "modifier onlyOwner() {\n  require(msg.sender == owner, \"not owner\");\n  _;\n}",
    "function approve(address spender, uint256 amount) public returns (bool) {\n  allowance[msg.sender][spender] = amount;\n  return true;\n}",
];

#[derive(Debug, Clone)]
pub struct CodeSnippet {
    pub text: String,
    pub source: String,
    pub difficulty: String,
    pub score: usize,
}

pub fn build_daily_practice_plan(
    records: &[SessionRecord],
    repo: &Path,
    plan: &PracticePlan,
) -> Result<DailyPracticePlan> {
    let today = Local::now().date_naive();
    let completed_ms = records
        .iter()
        .filter(|record| record.started_at.with_timezone(&Local).date_naive() == today)
        .map(|record| record.duration_ms)
        .sum::<u64>();

    let lessons = vec![
        lesson(
            LessonKind::Warmup,
            "热身：基础键位",
            "把手指放稳，只追正确率",
            3,
            PracticeTarget {
                mode: Mode::Chars,
                text: build_lesson_chars(),
                source: "keyloop:warmup".into(),
            },
        ),
        lesson(
            LessonKind::Chunks,
            "词块：英文拼写块",
            "练常见开头、结尾和字母组合",
            3,
            PracticeTarget {
                mode: Mode::Words,
                text: build_lesson_word_chunks(),
                source: "keyloop:word-chunks".into(),
            },
        ),
        lesson(
            LessonKind::CommonWords,
            "高频词：英语常用词",
            "练真正高频英文单词，不混大小写",
            3,
            PracticeTarget {
                mode: Mode::Words,
                text: build_lesson_common_words(),
                source: "keyloop:common-english".into(),
            },
        ),
        lesson(
            LessonKind::Words,
            "单词：前端高频词",
            "练常见英文单词和变量名",
            3,
            PracticeTarget {
                mode: Mode::Words,
                text: build_lesson_words(plan),
                source: "keyloop:programming-words".into(),
            },
        ),
        lesson(
            LessonKind::Symbols,
            "专项：数字和符号",
            "解决代码输入掉速的主要来源",
            3,
            PracticeTarget {
                mode: Mode::Symbols,
                text: build_lesson_symbols(plan),
                source: "keyloop:symbols".into(),
            },
        ),
        lesson(
            LessonKind::Naming,
            "命名：大小写和前端 API",
            "适应 camelCase、PascalCase 和 DOM/React 名称",
            2,
            PracticeTarget {
                mode: Mode::Case,
                text: build_lesson_naming(),
                source: "keyloop:naming".into(),
            },
        ),
        lesson(
            LessonKind::CodeBlock,
            "代码块：前端短代码",
            "练完整代码块，不练单行碎片",
            3,
            build_code_lesson_target(repo, plan)?,
        ),
    ];

    Ok(DailyPracticePlan {
        target_minutes: 20,
        completed_ms,
        lessons,
    })
}

fn lesson(
    kind: LessonKind,
    _title: &str,
    _purpose: &str,
    estimated_minutes: u16,
    target: PracticeTarget,
) -> PracticeLesson {
    PracticeLesson {
        kind,
        estimated_minutes,
        target,
    }
}

pub fn extract_snippets(repo: &Path) -> Result<Vec<CodeSnippet>> {
    let repo = repo
        .canonicalize()
        .with_context(|| format!("Could not open {}", repo.display()))?;
    let mut snippets = Vec::new();

    for entry in WalkBuilder::new(&repo)
        .hidden(false)
        .git_ignore(true)
        .git_exclude(true)
        .ignore(true)
        .build()
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if !path.is_file() || !is_supported_source(path) {
            continue;
        }

        let metadata = match fs::metadata(path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.len() > 200_000 {
            continue;
        }

        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };
        let relative = path.strip_prefix(&repo).unwrap_or(path);
        snippets.extend(snippets_from_file(&content, relative));
    }

    snippets.sort_by(|a, b| {
        difficulty_rank(&a.difficulty)
            .cmp(&difficulty_rank(&b.difficulty))
            .then_with(|| b.score.cmp(&a.score))
    });
    snippets.dedup_by(|a, b| a.text == b.text);
    Ok(snippets)
}

fn build_lesson_chars() -> String {
    let mut chunks = repeat_pool(CHAR_DRILLS, 10);
    chunks.truncate(10);
    chunks.join("\n")
}

fn build_lesson_word_chunks() -> String {
    let mut chunks = repeat_pool(WORD_CHUNKS, 10);
    chunks.truncate(10);
    chunks.join("\n")
}

fn build_lesson_common_words() -> String {
    let mut chosen = Vec::new();
    fill_from(&mut chosen, COMMON_ENGLISH_WORDS, 56);
    chunk_words(&chosen, 8).join("\n")
}

fn build_lesson_words(plan: &PracticePlan) -> String {
    let mut chosen = unique_focus(&plan.focus_words);
    fill_from(&mut chosen, WORDS, 35);
    chunk_words(&chosen, 7).join("\n")
}

fn build_lesson_symbols(plan: &PracticePlan) -> String {
    let mut chosen = unique_focus(&plan.focus_symbols);
    fill_from(&mut chosen, SYMBOLS, 48);
    append_from(&mut chosen, NUMBER_DRILLS, 3);
    chunk_words(&chosen, 8).join("\n")
}

fn build_lesson_naming() -> String {
    let mut chunks = repeat_pool(CASE_DRILLS, 8);
    chunks.truncate(8);
    chunks.join("\n")
}

fn build_code_lesson_target(repo: &Path, plan: &PracticePlan) -> Result<PracticeTarget> {
    let (snippets, scan_error) = match extract_snippets(repo) {
        Ok(snippets) => (snippets, None),
        Err(error) => (Vec::new(), Some(error.to_string())),
    };
    let mut picked = pick_code_snippets(&snippets, Some(plan), 3);
    let repo_count = picked.len();
    if picked.len() < 3 {
        for fallback in pick_builtin_code(Some(plan), 3 - picked.len()) {
            if !picked.iter().any(|text| text == &fallback) {
                picked.push(fallback);
            }
        }
    }
    if repo_count > 0 {
        return Ok(PracticeTarget {
            mode: Mode::Code,
            text: picked.join("\n\n"),
            source: if repo_count == picked.len() {
                repo.display().to_string()
            } else {
                format!("{} + keyloop:fallback-code", repo.display())
            },
        });
    }

    Ok(PracticeTarget {
        mode: Mode::Code,
        text: pick_builtin_code(Some(plan), 4).join("\n\n"),
        source: scan_error
            .map(|error| format!("keyloop:frontend-code (repo scan failed: {error})"))
            .unwrap_or_else(|| "keyloop:frontend-code".into()),
    })
}

fn pick_code_snippets(
    snippets: &[CodeSnippet],
    plan: Option<&PracticePlan>,
    count: usize,
) -> Vec<String> {
    let focus = plan
        .map(|plan| plan.focus_code.as_slice())
        .unwrap_or(&[])
        .iter()
        .map(|item| item.to_lowercase())
        .collect::<Vec<_>>();

    let mut candidates = snippets
        .iter()
        .filter(|snippet| is_practice_code_block(&snippet.text))
        .collect::<Vec<_>>();
    candidates.shuffle(&mut rand::thread_rng());
    if !focus.is_empty() {
        candidates.sort_by_key(|snippet| {
            std::cmp::Reverse(
                focus
                    .iter()
                    .filter(|term| snippet.text.to_lowercase().contains(term.as_str()))
                    .count(),
            )
        });
    }

    let mut selected = candidates
        .iter()
        .copied()
        .filter(|snippet| {
            focus.is_empty()
                || focus
                    .iter()
                    .any(|term| snippet.text.to_lowercase().contains(term))
        })
        .take(count)
        .map(|snippet| snippet.text.clone())
        .collect::<Vec<_>>();

    if selected.len() < count {
        for snippet in candidates {
            if selected.len() >= count {
                break;
            }
            if !selected.iter().any(|text| text == &snippet.text) {
                selected.push(snippet.text.clone());
            }
        }
    }

    selected
}

fn is_practice_code_block(text: &str) -> bool {
    text.is_ascii() && text.lines().filter(|line| !line.trim().is_empty()).count() >= 2
}

fn pick_builtin_code(plan: Option<&PracticePlan>, count: usize) -> Vec<String> {
    let mut snippets = CODE_SNIPPETS
        .iter()
        .map(|item| (*item).to_string())
        .collect::<Vec<_>>();
    snippets.shuffle(&mut rand::thread_rng());
    if let Some(plan) = plan {
        snippets.sort_by_key(|snippet| {
            std::cmp::Reverse(
                plan.focus_code
                    .iter()
                    .filter(|term| snippet.contains(term.as_str()))
                    .count(),
            )
        });
    }
    snippets.into_iter().take(count).collect()
}

fn unique_focus(focus: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    focus
        .iter()
        .filter(|item| !item.trim().is_empty())
        .filter(|item| seen.insert(item.to_lowercase()))
        .cloned()
        .collect()
}

fn fill_from(chosen: &mut Vec<String>, source: &[&str], target_len: usize) {
    let mut pool = source
        .iter()
        .map(|item| (*item).to_string())
        .collect::<Vec<_>>();
    pool.shuffle(&mut rand::thread_rng());

    for item in pool {
        if chosen.len() >= target_len {
            break;
        }
        if !chosen.iter().any(|existing| existing == &item) {
            chosen.push(item);
        }
    }
}

fn append_from(chosen: &mut Vec<String>, source: &[&str], count: usize) {
    let target_len = chosen.len() + count;
    let mut pool = source
        .iter()
        .map(|item| (*item).to_string())
        .collect::<Vec<_>>();
    pool.shuffle(&mut rand::thread_rng());

    for item in pool {
        if chosen.len() >= target_len {
            break;
        }
        if !chosen.iter().any(|existing| existing == &item) {
            chosen.push(item);
        }
    }
}

fn repeat_pool(source: &[&str], target_len: usize) -> Vec<String> {
    let mut output = Vec::new();
    while output.len() < target_len {
        let mut pool = source
            .iter()
            .map(|item| (*item).to_string())
            .collect::<Vec<_>>();
        pool.shuffle(&mut rand::thread_rng());
        output.extend(pool);
    }
    output.truncate(target_len);
    output
}

fn chunk_words(items: &[String], chunk_size: usize) -> Vec<String> {
    items
        .chunks(chunk_size)
        .map(|chunk| chunk.join(" "))
        .collect()
}

fn snippets_from_file(content: &str, relative_path: &Path) -> Vec<CodeSnippet> {
    let lines: Vec<&str> = content.lines().collect();
    let mut snippets = Vec::new();

    for index in 0..lines.len() {
        let line = lines[index].trim();
        if !is_candidate_line(line) {
            continue;
        }

        let source = format!("{}:{}", relative_path.display(), index + 1);

        if opens_block_or_callback(line) {
            let text = capture_block(&lines, index);
            if text.chars().count() <= 240 {
                if text.is_ascii() {
                    snippets.push(make_snippet(text, source));
                }
                continue;
            }
        }

        if line.is_ascii() {
            snippets.push(make_snippet(line.to_string(), source));
        }
    }

    snippets
}

fn capture_block(lines: &[&str], start: usize) -> String {
    let mut raw_block = Vec::new();
    let mut brace_balance = 0i32;
    let mut paren_balance = 0i32;

    for line in lines.iter().skip(start).take(14) {
        let trimmed = line.trim();
        if trimmed.is_empty() && !raw_block.is_empty() {
            break;
        }

        brace_balance += char_count(trimmed, '{') as i32;
        brace_balance -= char_count(trimmed, '}') as i32;
        paren_balance += char_count(trimmed, '(') as i32;
        paren_balance -= char_count(trimmed, ')') as i32;
        raw_block.push(line.trim_end().to_string());

        if raw_block.len() > 1
            && brace_balance <= 0
            && paren_balance <= 0
            && (trimmed.ends_with('}') || trimmed.ends_with("};") || trimmed.ends_with(");"))
        {
            break;
        }
    }

    normalize_indent(&raw_block).join("\n")
}

fn char_count(value: &str, target: char) -> usize {
    value.chars().filter(|ch| *ch == target).count()
}

fn normalize_indent(lines: &[String]) -> Vec<String> {
    let min_indent = lines
        .iter()
        .filter(|line| !line.trim().is_empty())
        .map(|line| leading_space_count(line))
        .min()
        .unwrap_or(0);

    lines
        .iter()
        .map(|line| strip_leading_spaces(line, min_indent))
        .collect()
}

fn leading_space_count(value: &str) -> usize {
    value
        .chars()
        .take_while(|ch| *ch == ' ' || *ch == '\t')
        .count()
}

fn strip_leading_spaces(value: &str, count: usize) -> String {
    value.chars().skip(count).collect()
}

fn make_snippet(text: String, source: String) -> CodeSnippet {
    let len = text.chars().count();
    let symbol_count = text
        .chars()
        .filter(|ch| !ch.is_ascii_alphanumeric() && !ch.is_whitespace())
        .count();
    let lines = text.lines().count();
    let score = len / 8 + symbol_count * 2 + lines * 4;
    let difficulty = if score <= 16 {
        "easy"
    } else if score <= 34 {
        "medium"
    } else {
        "hard"
    }
    .to_string();

    CodeSnippet {
        text,
        source,
        difficulty,
        score,
    }
}

fn difficulty_rank(value: &str) -> usize {
    match value {
        "medium" => 0,
        "easy" => 1,
        _ => 2,
    }
}

fn is_supported_source(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    if file_name.ends_with(".min.js")
        || file_name.ends_with(".lock")
        || file_name == "package-lock.json"
        || file_name == "pnpm-lock.yaml"
        || file_name == "yarn.lock"
    {
        return false;
    }

    matches!(
        extension(path).as_deref(),
        Some("rs")
            | Some("ts")
            | Some("tsx")
            | Some("js")
            | Some("jsx")
            | Some("mjs")
            | Some("cjs")
            | Some("py")
            | Some("go")
            | Some("java")
            | Some("rb")
            | Some("php")
            | Some("swift")
            | Some("kt")
            | Some("css")
            | Some("scss")
            | Some("sass")
            | Some("less")
            | Some("html")
            | Some("vue")
            | Some("svelte")
            | Some("sol")
    )
}

fn extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}

fn is_candidate_line(line: &str) -> bool {
    if line.len() < 12 || line.len() > 140 {
        return false;
    }
    if line.starts_with("//")
        || line.starts_with("/*")
        || line.starts_with('*')
        || line.starts_with('#')
    {
        return false;
    }

    let has_code_signal = [
        "const ",
        "let ",
        "var ",
        "function ",
        "return ",
        "import ",
        "export ",
        "if ",
        "for ",
        "while ",
        "=>",
        "useState",
        "useEffect",
        "className",
        "async ",
        "await ",
    ]
    .iter()
    .any(|needle| line.contains(needle));

    has_code_signal
        || line
            .chars()
            .filter(|ch| "(){}[]<>=!&|_.".contains(*ch))
            .count()
            >= 4
}

fn opens_block_or_callback(line: &str) -> bool {
    line.ends_with('{') || line.contains("=>") || line.contains("function ")
}

#[allow(dead_code)]
fn _canonical_or_original(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_snippet_difficulty() {
        let snippet = make_snippet(
            "const value = items.map((item) => item.id);".into(),
            "x:1".into(),
        );
        assert!(snippet.score > 0);
        assert!(!snippet.difficulty.is_empty());
    }

    #[test]
    fn preserves_relative_indent_in_blocks() {
        let content = "  if (value) {\n    return value;\n  }";
        let snippets = snippets_from_file(content, Path::new("sample.ts"));
        assert!(
            snippets
                .iter()
                .any(|snippet| snippet.text == "if (value) {\n  return value;\n}")
        );
    }

    #[test]
    fn code_lesson_picker_skips_single_line_snippets() {
        let snippets = vec![
            CodeSnippet {
                text: "const value = getValue();".to_string(),
                source: "single.ts:1".to_string(),
                score: 1,
                difficulty: "easy".to_string(),
            },
            CodeSnippet {
                text: "function readValue() {\n  return getValue();\n}".to_string(),
                source: "block.ts:1".to_string(),
                score: 10,
                difficulty: "medium".to_string(),
            },
        ];

        let picked = pick_code_snippets(&snippets, None, 3);

        assert_eq!(picked.len(), 1);
        assert!(picked[0].contains('\n'));
        assert!(!picked[0].contains("const value = getValue();"));
    }

    #[test]
    fn snippet_extraction_skips_non_ascii_blocks() {
        let content = r#"
function label() {
  return "设置";
}

function value() {
  return "settings";
}
"#;

        let snippets = snippets_from_file(content, Path::new("sample.ts"));

        assert!(!snippets.iter().any(|snippet| snippet.text.contains("设置")));
        assert!(
            snippets
                .iter()
                .any(|snippet| snippet.text.contains("settings"))
        );
    }
}
