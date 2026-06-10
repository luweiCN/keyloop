import { readFileSync, writeFileSync } from "node:fs";
import { scoreTypingDifficulty } from "../training/typingDifficulty";

const inputPath = process.argv[2];
if (inputPath === undefined) {
  console.error("Usage: bun src/tools/scoreJsonl.ts <input.jsonl> [output.jsonl]");
  process.exit(1);
}
const outputPath = process.argv[3] ?? inputPath;

const lines = readFileSync(inputPath, "utf-8").split("\n").filter(Boolean);
const results: string[] = [];
let easy = 0, medium = 0, hard = 0;

for (const line of lines) {
  const record = JSON.parse(line);
  const text = record.text || "";
  if (!text) continue;

  const scored = scoreTypingDifficulty(text);
  record.difficulty_score = scored.score;
  record.difficulty_reasons = scored.reasons;
  record.difficulty = scored.difficulty;

  if (scored.score <= 5) easy++;
  else if (scored.score <= 10) medium++;
  else hard++;

  results.push(JSON.stringify(record));
}

writeFileSync(outputPath, results.join("\n") + "\n");
console.log(`Scored ${lines.length} entries: easy=${easy}, medium=${medium}, hard=${hard}`);
