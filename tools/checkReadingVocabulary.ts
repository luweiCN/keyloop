// Diagnose which everyday sentences/articles fail the reading vocabulary gate.
// Usage: bun tools/checkReadingVocabulary.ts
import { loadContentLibrary } from "../ts/src/content/library";
import {
  buildReadingVocabularyProfile,
  readingVocabularyCoverage,
  readingVocabularyThreshold,
} from "../ts/src/content/readingVocabulary";

const library = await loadContentLibrary();
const profile = buildReadingVocabularyProfile(library.everyday_words.entries);

let failures = 0;
for (const entry of library.everyday_sentences.entries) {
  if (entry.source_id !== "keyloop:authored-everyday-v1") {
    continue;
  }
  const coverage = readingVocabularyCoverage(entry.text, entry.level, profile);
  const threshold = readingVocabularyThreshold(entry.level);
  if (
    coverage.coverage < threshold.minCoverage ||
    coverage.uniqueCoverage < threshold.minUniqueCoverage
  ) {
    failures += 1;
    console.log(
      `[${entry.level}/${entry.length}] cov=${coverage.coverage.toFixed(2)} uniq=${coverage.uniqueCoverage.toFixed(2)} | ${entry.text}`,
    );
    console.log(`   unknown: ${coverage.unknownWords.join(", ")}`);
  }
}
console.log(`\n${failures} authored sentences fail the vocabulary gate`);

for (const article of library.everyday_articles.entries) {
  if (article.source_id !== "keyloop:authored-everyday-v1") {
    continue;
  }
  const text = article.paragraphs.map((p) => p.text).join(" ");
  const coverage = readingVocabularyCoverage(text, article.level, profile);
  const threshold = readingVocabularyThreshold(article.level);
  if (
    coverage.coverage < threshold.minCoverage ||
    coverage.uniqueCoverage < threshold.minUniqueCoverage
  ) {
    console.log(
      `[article ${article.level}/${article.length}] cov=${coverage.coverage.toFixed(2)} uniq=${coverage.uniqueCoverage.toFixed(2)} | ${article.title}`,
    );
    console.log(`   unknown: ${coverage.unknownWords.join(", ")}`);
  }
}
