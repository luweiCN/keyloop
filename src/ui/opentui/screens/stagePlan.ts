import type { Language, MainGoal, PracticeLesson } from "../../../domain/model";
import type { GoalRecommendation } from "../../../training/goalPlan";
import { SESSION_LENGTH_PRESETS, snapToPreset } from "../../../training/prescription";
import { formLabel } from "../labels";
import type { OpenTuiAppState } from "../appModel";
import { openTuiRouteTitle } from "../appModel";
import { TEXT_BOLD, theme } from "../theme";
import { badge, panel, sectionLabel } from "../components";
import type { OpenTuiRendererKit } from "../kit";

export function renderStagePlanScreen(state: OpenTuiAppState, kit: OpenTuiRendererKit): unknown {
  if (state.route.screen !== "stage_plan") {
    return kit.Box({ id: "keyloop-stage-plan" });
  }
  const zh = state.language === "zh";
  const completed = new Set(state.route.completed_lesson_ids ?? []);
  const planMinutes = state.route.plan.lessons.reduce(
    (sum, lesson) => sum + lesson.estimated_minutes,
    0,
  );
  const completedMinutes = Math.round(state.route.plan.completed_ms / 60_000);

  return panel(
    "keyloop-stage-plan",
    { title: openTuiRouteTitle(state), width: "100%", flexGrow: 1, gap: 1, paddingX: 1 },
    kit,
    ...(state.route.goal !== undefined && state.route.goal_recommendation !== undefined
      ? [
          sectionLabel("keyloop-stage-plan-goal-section", zh ? "目标" : "Goal", kit),
          renderGoalSummary(
            state.route.goal,
            state.route.goal_recommendation,
            state.language,
            kit,
          ),
        ]
      : []),
    sectionLabel("keyloop-stage-plan-diagnosis-section", zh ? "诊断" : "Diagnosis", kit),
    renderDiagnosisRows(state.route.diagnosis_lines, kit),
    sectionLabel("keyloop-stage-plan-lessons-section", zh ? "今日阶段" : "Today's stages", kit),
    renderPlanSummary(
      state.route.plan.lessons.length,
      planMinutes,
      state.route.plan.target_minutes,
      completedMinutes,
      zh,
      kit,
    ),
    ...state.route.plan.lessons.map((lesson, index) =>
      renderLessonRow(lesson, index, completed.has(lesson.id), state.language, kit),
    ),
    sectionLabel("keyloop-stage-plan-duration-section", zh ? "时长档位" : "Session length", kit),
    renderDurationPresets(state.route.plan.target_minutes, zh, kit),
  );
}

function renderGoalSummary(
  goal: MainGoal,
  recommendation: GoalRecommendation,
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  const zh = language === "zh";
  const current = Math.round(recommendation.current_wpm);
  const span = `${current}→${goal.target_wpm}`;
  return kit.Box(
    {
      id: "keyloop-stage-plan-goal-summary",
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    badge("keyloop-stage-plan-goal-form", formLabel(goal.form, language), kit, {
      tone: "info",
      variant: "solid",
    }),
    kit.Text({
      id: "keyloop-stage-plan-goal-span",
      content: span,
      fg: theme.foreground,
      attributes: TEXT_BOLD,
      height: 1,
      wrapMode: "none",
    }),
    kit.Text({
      id: "keyloop-stage-plan-goal-status",
      content: goalStatusText(recommendation, current, zh),
      fg: theme.muted,
      height: 1,
      truncate: true,
      wrapMode: "none",
      flexGrow: 1,
    }),
  );
}

function goalStatusText(
  recommendation: GoalRecommendation,
  currentWpm: number,
  zh: boolean,
): string {
  switch (recommendation.phase) {
    case "on_track":
      return zh
        ? `预计 ${formatMonthDay(recommendation.projected_date)} · 建议每日约 ${recommendation.daily_minutes} 分钟`
        : `ETA ${formatMonthDay(recommendation.projected_date)} · about ${recommendation.daily_minutes} min/day`;
    case "cold_start":
      return zh
        ? `数据积累中，先练满 7 天给精准计划 · 建议每日约 ${recommendation.daily_minutes} 分钟`
        : `Building history; practice 7 days for a precise plan · about ${recommendation.daily_minutes} min/day`;
    case "unreachable": {
      const projected = Math.round(recommendation.projected_wpm_at_deadline ?? currentWpm);
      return zh
        ? `按当前节奏期限内约到 ${projected} · 可延期/加量/调目标`
        : `~${projected} by deadline at this pace · extend / add time / adjust`;
    }
    case "achieved":
      return zh ? "目标已达成" : "Goal reached";
  }
}

function formatMonthDay(isoDate: string | undefined): string {
  if (isoDate === undefined) {
    return "?";
  }
  const parts = isoDate.split("-");
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function renderDiagnosisRows(lines: readonly string[], kit: OpenTuiRendererKit): unknown {
  return kit.Box(
    {
      id: "keyloop-stage-plan-diagnosis-list",
      flexDirection: "column",
      gap: 0,
      width: "100%",
      overflow: "hidden",
    },
    ...lines.map((line, index) =>
      kit.Text({
        id: `keyloop-stage-plan-diagnosis-${index}`,
        content: `  ${line}`,
        fg: theme.muted,
        height: 1,
        truncate: true,
        wrapMode: "none",
      }),
    ),
  );
}

function renderPlanSummary(
  count: number,
  planMinutes: number,
  targetMinutes: number,
  completedMinutes: number,
  zh: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  return kit.Box(
    {
      id: "keyloop-stage-plan-summary",
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    badge("keyloop-stage-plan-summary-count", zh ? `${count} 阶段` : `${count} stages`, kit, {
      tone: "good",
      variant: "solid",
    }),
    kit.Text({
      id: "keyloop-stage-plan-summary-copy",
      content: zh
        ? `本次约 ${planMinutes} 分钟 · 选定 ${targetMinutes} 分钟 · 今日已练 ${completedMinutes} 分钟`
        : `~${planMinutes} min this run · target ${targetMinutes} · done today ${completedMinutes} min`,
      fg: theme.foreground,
      height: 1,
      truncate: true,
      wrapMode: "none",
      flexGrow: 1,
    }),
  );
}

function renderLessonRow(
  lesson: PracticeLesson,
  index: number,
  completed: boolean,
  language: Language,
  kit: OpenTuiRendererKit,
): unknown {
  const reason = language === "zh" ? lesson.reason_zh : lesson.reason_en;
  return kit.Box(
    {
      id: `keyloop-stage-plan-lesson-${index}`,
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    kit.Text({
      id: `keyloop-stage-plan-lesson-${index}-index`,
      content: completed ? "✓" : String(index + 1).padStart(2, "0"),
      fg: completed ? theme.accent : theme.muted,
      attributes: completed ? TEXT_BOLD : undefined,
      height: 1,
      wrapMode: "none",
    }),
    kit.Text({
      id: `keyloop-stage-plan-lesson-${index}-minutes`,
      content:
        language === "zh" ? `${lesson.estimated_minutes} 分钟` : `${lesson.estimated_minutes} min`,
      fg: theme.info,
      attributes: TEXT_BOLD,
      height: 1,
      wrapMode: "none",
    }),
    kit.Text({
      id: `keyloop-stage-plan-lesson-${index}-reason`,
      content: reason,
      fg: completed ? theme.muted : theme.foreground,
      height: 1,
      truncate: true,
      wrapMode: "none",
      flexGrow: 1,
    }),
  );
}

function renderDurationPresets(
  targetMinutes: number,
  zh: boolean,
  kit: OpenTuiRendererKit,
): unknown {
  const activePreset = snapToPreset(targetMinutes);
  return kit.Box(
    {
      id: "keyloop-stage-plan-duration-presets",
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    kit.Text({
      id: "keyloop-stage-plan-duration-label",
      content: zh ? "←/→ 调整" : "Left/Right adjusts",
      fg: theme.muted,
      height: 1,
      wrapMode: "none",
    }),
    ...SESSION_LENGTH_PRESETS.map((minutes) =>
      badge(`keyloop-stage-plan-duration-${minutes}`, `${minutes}`, kit, {
        tone: minutes === activePreset ? "warn" : "neutral",
        variant: minutes === activePreset ? "solid" : "soft",
      }),
    ),
  );
}
