import type {
  CodeStyleSettings,
  EverydayEnglishSettings,
  Language,
  UserPreferences,
} from "../../domain/model";
import type { TrainingForm } from "../../training/diagnosis";

/**
 * Single source of truth for user-facing option labels. Settings rows, the
 * Ctrl+O options popup, and the running-screen status line must all read
 * from here so the same value never renders with different wording.
 */

export function titleCase(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

export function codeDifficultyLabel(
  value: UserPreferences["code_practice"]["difficulty"] | string,
  language: Language,
): string {
  if (language !== "zh") {
    return value === "all" ? "Any" : titleCase(value);
  }
  const labels: Record<string, string> = {
    adaptive: "自适应",
    all: "不限",
    easy: "简单",
    medium: "中等",
    hard: "困难",
  };
  return labels[value] ?? value;
}

export function codeLengthLabel(
  value: UserPreferences["code_practice"]["length"] | string,
  language: Language,
): string {
  if (language !== "zh") {
    return titleCase(value);
  }
  const labels: Record<string, string> = {
    adaptive: "自适应",
    short: "短",
    medium: "中等",
    long: "长",
  };
  return labels[value] ?? value;
}

export function everydayWordRangeLabel(
  value: EverydayEnglishSettings["word_range"],
  language: Language,
): string {
  const labels =
    language === "zh"
      ? {
          "200": "基础 200",
          "1000": "常用 1000",
          "5000": "进阶 5000",
          "10000": "扩展 10000",
        }
      : {
          "200": "Basic 200",
          "1000": "Common 1000",
          "5000": "Advanced 5000",
          "10000": "Extended 10000",
        };
  return labels[value];
}

/** Full level label with approximate vocabulary size, e.g. 四级（约 4500 词）. */
export function everydayLevelLabel(
  value: EverydayEnglishSettings["sentence_level"],
  language: Language,
): string {
  if (language !== "zh") {
    const labels: Record<string, string> = {
      high_school: "High school (~3500 words)",
      cet4: "CET-4 (~4500 words)",
      cet6: "CET-6 (~6000 words)",
      postgraduate: "Postgraduate (~7000 words)",
      toefl_ielts: "TOEFL/IELTS (~10000 words)",
    };
    return labels[value] ?? value;
  }
  const labels: Record<string, string> = {
    high_school: "高中（约 3500 词）",
    cet4: "四级（约 4500 词）",
    cet6: "六级（约 6000 词）",
    postgraduate: "考研（约 7000 词）",
    toefl_ielts: "托福雅思（约 10000 词）",
  };
  return labels[value] ?? value;
}

/** Compact level label for tight spaces (running-screen status line). */
export function everydayLevelShortLabel(
  value: EverydayEnglishSettings["sentence_level"],
  language: Language,
): string {
  if (language !== "zh") {
    const labels: Record<string, string> = {
      high_school: "High school",
      cet4: "CET-4",
      cet6: "CET-6",
      postgraduate: "Postgraduate",
      toefl_ielts: "TOEFL/IELTS",
    };
    return labels[value] ?? value;
  }
  const labels: Record<string, string> = {
    high_school: "高中",
    cet4: "四级",
    cet6: "六级",
    postgraduate: "考研",
    toefl_ielts: "托福雅思",
  };
  return labels[value] ?? value;
}

export function everydayLengthLabel(
  value: EverydayEnglishSettings["sentence_length"] | EverydayEnglishSettings["article_length"],
  language: Language,
): string {
  if (language !== "zh") {
    return titleCase(value);
  }
  const labels: Record<string, string> = {
    short: "短",
    medium: "中等",
    long: "长",
    mixed: "混合",
  };
  return labels[value] ?? value;
}

export function codeFilterFacetLabel(
  facet: "language" | "framework" | "project",
  language: Language,
): string {
  switch (facet) {
    case "language":
      return language === "zh" ? "语言" : "language";
    case "framework":
      return language === "zh" ? "框架" : "framework";
    case "project":
      return language === "zh" ? "项目" : "project";
  }
}

const codeFacetAliases: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  nextjs: "Next.js",
  nestjs: "NestJS",
  nuxt: "Nuxt",
  vue: "Vue",
  react: "React",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "LESS",
  php: "PHP",
  sql: "SQL",
  rust: "Rust",
  go: "Go",
  python: "Python",
  java: "Java",
  csharp: "C#",
  cpp: "C++",
  solidity: "Solidity",
  tailwind: "Tailwind",
  hardhat: "Hardhat",
  foundry: "Foundry",
  fastify: "Fastify",
  fastapi: "FastAPI",
  django: "Django",
  rails: "Rails",
  laravel: "Laravel",
  angular: "Angular",
  astro: "Astro",
  svelte: "Svelte",
  hono: "Hono",
  gin: "Gin",
  axum: "Axum",
};

/** Display name for a code language/framework facet value, e.g. nextjs → Next.js. */
export function codeFacetLabel(value: string): string {
  return codeFacetAliases[value] ?? value.split("-").map(titleCase).join("-");
}

export function codeIndentLabel(settings: CodeStyleSettings, language: Language): string {
  if (settings.indent_style === "tab") {
    return "Tab";
  }
  return language === "zh" ? `${settings.indent_width} 空格` : `${settings.indent_width} spaces`;
}

/** 训练形态的展示名（目标设置项、目标进度行共用）。 */
export function formLabel(form: TrainingForm, language: Language): string {
  const zh = language === "zh";
  switch (form) {
    case "keys":
      return zh ? "键位" : "Keys";
    case "words":
      return zh ? "单词" : "Words";
    case "symbols":
      return zh ? "符号" : "Symbols";
    case "sentences":
      return zh ? "句子" : "Sentences";
    case "articles":
      return zh ? "文章" : "Articles";
    case "code":
      return zh ? "代码" : "Code";
  }
}
