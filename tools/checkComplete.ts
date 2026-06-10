import { loadContentLibrary } from "../ts/src/content/library";
import { readingSentenceQualityIssues } from "../ts/src/content/readingTextQuality";
const library = await loadContentLibrary();
for (const e of library.everyday_sentences.entries) {
  if (e.source_id !== "keyloop:authored-everyday-v1") continue;
  const issues = readingSentenceQualityIssues(e.text);
  if (issues.length > 0) console.log(issues.join(","), "|", e.text);
}
