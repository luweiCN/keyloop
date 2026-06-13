import type { SessionRecord, TrainingModule } from "../domain/model";
import type {
  FormSpeed,
  SkillDimensionId,
  SkillProfile,
  TrainingForm,
} from "./diagnosis";
import { formForCategory } from "./diagnosis";

const MIN_DAILY_MINUTES = 10;
const MAX_DAILY_MINUTES = 45;
const BASE_MINUTES = 15;
const MAINTENANCE_BASE_MINUTES = 10;
const MINUTES_PER_WEAK_DIMENSION = 5;
/** 判定"全面稳定"所需的最少已评估维度数 */
const MIN_RATED_FOR_MAINTENANCE = 3;

export function recommendedDailyMinutes(profile: SkillProfile): number {
  const rated = profile.dimensions.filter((item) => item.status !== "unrated");
  const weakCount = rated.filter((item) => item.status === "weak").length;
  const allStable =
    rated.length >= MIN_RATED_FOR_MAINTENANCE &&
    rated.every((item) => item.status === "stable");
  const base = allStable ? MAINTENANCE_BASE_MINUTES : BASE_MINUTES;
  let minutes = base + weakCount * MINUTES_PER_WEAK_DIMENSION;
  if (profile.daily_active_minutes_7d > 0) {
    minutes = Math.min(
      minutes,
      Math.max(BASE_MINUTES, Math.round(profile.daily_active_minutes_7d * 1.5)),
    );
  }
  return clamp(Math.round(minutes), MIN_DAILY_MINUTES, MAX_DAILY_MINUTES);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface StagePlan {
  form: TrainingForm;
  minutes: number;
  /** 该阶段语料的字符预算 = minutes × 形态 WPM × 5 */
  char_budget: number;
  /** 是否为弱项加强阶段（间歇屏与裁剪优先级用） */
  weak: boolean;
  reason_zh: string;
  reason_en: string;
}

export interface DailyPrescription {
  target_minutes: number;
  stages: StagePlan[];
}

export interface PrescriptionInput {
  profile: SkillProfile;
  enabledModules: TrainingModule[];
  /** 全部历史会话：用于长内容轮换查询 */
  records: SessionRecord[];
  now: Date;
  random?: () => number;
  /** 覆盖推荐时长（诊断屏手动调整），clamp [10, 60] */
  targetMinutesOverride?: number;
}

/** 手动调整时长的上限（高于自动推荐上限，允许用户主动加练） */
const MAX_OVERRIDE_MINUTES = 60;

/** 冷启动各形态保守默认 WPM */
export const FORM_FALLBACK_WPM: Record<TrainingForm, number> = {
  keys: 18,
  words: 22,
  symbols: 16,
  sentences: 22,
  articles: 22,
  code: 14,
};

/** 冷启动预算折扣：宁可练完意犹未尽，不要超量劝退 */
const COLD_START_DISCOUNT = 0.8;
/** 键位热身固定分钟数 */
const WARMUP_MINUTES = 2;
/** 文章轮换间隔（天） */
const ARTICLE_ROTATION_DAYS = 3;
/** 非弱项时符号阶段的轮换概率 */
const SYMBOLS_ROTATION_PROBABILITY = 0.5;
/** 弱项阶段权重 / 稳定阶段权重 */
const WEAK_WEIGHT = 1.5;
const STABLE_WEIGHT = 0.5;
/** 权重分配阶段的最少分钟数 */
const MIN_STAGE_MINUTES = 2;

/** 技能维度 → 治疗形态（"技能跨阶段，内容不跨形态"中的技能侧映射） */
const DIMENSION_FORM: Record<SkillDimensionId, TrainingForm> = {
  home_row: "keys",
  top_row: "keys",
  bottom_row: "keys",
  left_hand: "keys",
  right_hand: "keys",
  digits: "symbols",
  symbols: "symbols",
  capitalization: "words",
  word_fluency: "words",
  long_words: "words",
};

export function buildDailyPrescription(input: PrescriptionInput): DailyPrescription {
  const random = input.random ?? Math.random;
  const targetMinutes =
    input.targetMinutesOverride === undefined
      ? recommendedDailyMinutes(input.profile)
      : clamp(Math.round(input.targetMinutesOverride), MIN_DAILY_MINUTES, MAX_OVERRIDE_MINUTES);
  const weakForms = collectWeakForms(input.profile);
  const stableForms = collectStableForms(input.profile);
  const everydayEnabled = input.enabledModules.includes("everyday_english");
  const codeEnabled = input.enabledModules.includes("code_practice");

  const forms: TrainingForm[] = ["words"];
  if (weakForms.has("symbols") || random() < SYMBOLS_ROTATION_PROBABILITY) {
    forms.push("symbols");
  }
  if (everydayEnabled) {
    forms.push("sentences");
    if (daysSinceForm(input.records, "articles", input.now) >= ARTICLE_ROTATION_DAYS) {
      forms.push("articles");
    }
  }
  if (codeEnabled) {
    forms.push("code");
  }

  const distributable = Math.max(targetMinutes - WARMUP_MINUTES, MIN_STAGE_MINUTES);
  const weighted = forms.map((form) => ({
    form,
    weight: weakForms.has(form)
      ? WEAK_WEIGHT
      : stableForms.has(form)
        ? STABLE_WEIGHT
        : 1,
  }));
  const weightTotal = weighted.reduce((sum, item) => sum + item.weight, 0);
  const stages: StagePlan[] = [
    stagePlan("keys", WARMUP_MINUTES, weakForms.has("keys"), input.profile),
  ];
  let allocated = 0;
  for (const [index, item] of weighted.entries()) {
    const isLast = index === weighted.length - 1;
    const rawMinutes = (item.weight / weightTotal) * distributable;
    const minutes = isLast
      ? Math.max(distributable - allocated, MIN_STAGE_MINUTES)
      : Math.max(Math.round(rawMinutes), MIN_STAGE_MINUTES);
    allocated += minutes;
    stages.push(stagePlan(item.form, minutes, weakForms.has(item.form), input.profile));
  }

  return { target_minutes: targetMinutes, stages };
}

function stagePlan(
  form: TrainingForm,
  minutes: number,
  weak: boolean,
  profile: SkillProfile,
): StagePlan {
  return {
    form,
    minutes,
    char_budget: charBudget(form, minutes, profile.form_speeds),
    weak,
    reason_zh: stageReasonZh(form, weak, profile),
    reason_en: stageReasonEn(form, weak, profile),
  };
}

export function charBudget(
  form: TrainingForm,
  minutes: number,
  speeds: FormSpeed[],
): number {
  const measured = speeds.find((item) => item.form === form)?.ewma_wpm ?? null;
  const wpm = measured ?? FORM_FALLBACK_WPM[form] * COLD_START_DISCOUNT;
  return Math.round(minutes * wpm * 5);
}

function collectWeakForms(profile: SkillProfile): Set<TrainingForm> {
  const forms = new Set<TrainingForm>();
  for (const dimension of profile.dimensions) {
    if (dimension.status === "weak") {
      forms.add(DIMENSION_FORM[dimension.id]);
    }
  }
  return forms;
}

function collectStableForms(profile: SkillProfile): Set<TrainingForm> {
  const byForm = new Map<TrainingForm, boolean>();
  for (const dimension of profile.dimensions) {
    if (dimension.status === "unrated") {
      continue;
    }
    const form = DIMENSION_FORM[dimension.id];
    const current = byForm.get(form);
    byForm.set(form, (current ?? true) && dimension.status === "stable");
  }
  const forms = new Set<TrainingForm>();
  for (const [form, allStable] of byForm) {
    if (allStable) {
      forms.add(form);
    }
  }
  return forms;
}

/** 该形态上次出现距今天数；从未出现返回 Infinity */
function daysSinceForm(
  records: SessionRecord[],
  form: TrainingForm,
  now: Date,
): number {
  let latestMs = 0;
  for (const record of records) {
    if (formForCategory(record.category) !== form) {
      continue;
    }
    const startedMs = Date.parse(record.started_at);
    if (Number.isFinite(startedMs) && startedMs > latestMs) {
      latestMs = startedMs;
    }
  }
  if (latestMs === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return (now.getTime() - latestMs) / (24 * 60 * 60 * 1000);
}

function weakDimensionSummary(profile: SkillProfile, form: TrainingForm): string {
  return profile.dimensions
    .filter(
      (dimension) =>
        dimension.status === "weak" && DIMENSION_FORM[dimension.id] === form,
    )
    .map((dimension) => dimension.id)
    .join(", ");
}

function stageReasonZh(
  form: TrainingForm,
  weak: boolean,
  profile: SkillProfile,
): string {
  const base: Record<TrainingForm, string> = {
    keys: "键位指法热身",
    words: "单词流畅度训练",
    symbols: "符号与数字专项",
    sentences: "句子连贯输入",
    articles: "文章长文输入（轮换）",
    code: "真实代码实战",
  };
  if (weak) {
    return `${base[form]}：弱项加强（${weakDimensionSummary(profile, form)}）`;
  }
  return `${base[form]}：常规轮换维持手感`;
}

function stageReasonEn(
  form: TrainingForm,
  weak: boolean,
  profile: SkillProfile,
): string {
  const base: Record<TrainingForm, string> = {
    keys: "Key position warmup",
    words: "Word fluency training",
    symbols: "Symbols and digits focus",
    sentences: "Sentence flow input",
    articles: "Article long-form input (rotation)",
    code: "Real code practice",
  };
  if (weak) {
    return `${base[form]}: weak-spot boost (${weakDimensionSummary(profile, form)})`;
  }
  return `${base[form]}: regular rotation to keep touch`;
}

export interface CompletedStage {
  form: TrainingForm;
  actual_minutes: number;
  actual_wpm: number;
}

/**
 * 会话内修正：移除已完成阶段，按实测速度重算剩余阶段预算，
 * 并向今日目标对齐——剩余时间不足时按"先砍常规、保留弱项"裁剪。
 */
export function reviseStages(
  prescription: DailyPrescription,
  completed: CompletedStage[],
): DailyPrescription {
  const doneCount = completed.length;
  const remaining = prescription.stages.slice(doneCount);
  const spentMinutes = completed.reduce((sum, stage) => sum + stage.actual_minutes, 0);
  let minutesLeft = Math.max(prescription.target_minutes - spentMinutes, 0);

  // 本会话实测速度（同形态多次取平均）
  const measured = new Map<TrainingForm, number>();
  for (const stage of completed) {
    if (stage.actual_wpm <= 0) {
      continue;
    }
    const existing = measured.get(stage.form);
    measured.set(
      stage.form,
      existing === undefined ? stage.actual_wpm : (existing + stage.actual_wpm) / 2,
    );
  }

  // 裁剪：时间不足时先砍常规阶段（保持原顺序），弱项阶段最后砍
  const regularFirst = [...remaining].sort(
    (left, right) => Number(left.weak) - Number(right.weak),
  );
  const dropped = new Set<StagePlan>();
  let needed = remaining.reduce(
    (sum, stage) => sum + Math.max(stage.minutes, MIN_STAGE_MINUTES),
    0,
  );
  for (const stage of regularFirst) {
    if (needed <= minutesLeft || minutesLeft < MIN_STAGE_MINUTES) {
      break;
    }
    if (needed - stage.minutes >= Math.max(minutesLeft, MIN_STAGE_MINUTES)) {
      dropped.add(stage);
      needed -= stage.minutes;
    }
  }

  const survivors = remaining.filter((stage) => !dropped.has(stage));
  if (survivors.length === 0) {
    return { target_minutes: prescription.target_minutes, stages: [] };
  }
  if (minutesLeft < MIN_STAGE_MINUTES) {
    // 时间已超目标：只保留弱项阶段，给最低剂量
    const weakOnly = survivors.filter((stage) => stage.weak);
    return {
      target_minutes: prescription.target_minutes,
      stages: weakOnly.map((stage) => rebudget(stage, MIN_STAGE_MINUTES, measured)),
    };
  }

  // 弱项阶段优先保剂量：保留原分钟，由常规阶段吸收压缩；
  // 仅当剩余时间连弱项都装不下时，才按比例压缩弱项兜底
  const weakMinutes = survivors
    .filter((stage) => stage.weak)
    .reduce((sum, stage) => sum + stage.minutes, 0);
  if (weakMinutes >= minutesLeft) {
    const weakOnly = survivors.filter((stage) => stage.weak);
    const scale = weakMinutes === 0 ? 1 : minutesLeft / weakMinutes;
    return {
      target_minutes: prescription.target_minutes,
      stages: weakOnly.map((stage) =>
        rebudget(stage, Math.max(Math.round(stage.minutes * scale), MIN_STAGE_MINUTES), measured),
      ),
    };
  }
  const regularPlanned = survivors
    .filter((stage) => !stage.weak)
    .reduce((sum, stage) => sum + stage.minutes, 0);
  const regularScale =
    regularPlanned === 0 ? 1 : (minutesLeft - weakMinutes) / regularPlanned;
  return {
    target_minutes: prescription.target_minutes,
    stages: survivors.map((stage) =>
      stage.weak
        ? rebudget(stage, stage.minutes, measured)
        : rebudget(
            stage,
            Math.max(Math.round(stage.minutes * regularScale), MIN_STAGE_MINUTES),
            measured,
          ),
    ),
  };
}

function rebudget(
  stage: StagePlan,
  minutes: number,
  measured: Map<TrainingForm, number>,
): StagePlan {
  const measuredWpm = measured.get(stage.form);
  const budget =
    measuredWpm === undefined
      ? Math.round((stage.char_budget / Math.max(stage.minutes, 1)) * minutes)
      : Math.round(minutes * measuredWpm * 5);
  return { ...stage, minutes, char_budget: budget };
}
