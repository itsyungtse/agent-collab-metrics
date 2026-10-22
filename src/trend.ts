import { readReactionRecords, readRulesAppliedHistory } from "./local-data.ts";
import { weeklyTrend, type WeekTrend } from "./weekly-trend.ts";

const PERCENT_PER_BAR_CHARACTER = 2;

function percent(count: number, total: number): number {
  return Math.round((count / total) * 100);
}

function formatPercent(count: number, total: number): string {
  return `${percent(count, total)}%`.padStart(4);
}

function formatLocalDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function describeWeek(week: WeekTrend): string {
  const rulesMarker = week.rulesUpdates > 0 ? "  <- rules updated" : "";
  const weekLabel = `  ${formatLocalDate(week.weekStart)} n=${String(week.reactions).padEnd(5)}`;
  if (week.reactions === 0) return `${weekLabel}${rulesMarker}`;
  const problems = week.corrections + week.confusions;
  const bar = "█".repeat(Math.round(percent(problems, week.reactions) / PERCENT_PER_BAR_CHARACTER));
  return (
    `${weekLabel} correction=${formatPercent(week.corrections, week.reactions)}` +
    ` confusion=${formatPercent(week.confusions, week.reactions)}` +
    `  ${formatPercent(problems, week.reactions)} ${bar}${rulesMarker}`
  );
}

const weeks = weeklyTrend(readReactionRecords(process.argv[2]), readRulesAppliedHistory());
console.log(`correction + confusion rate per week (weeks start on Monday, each █ is ${PERCENT_PER_BAR_CHARACTER}%)`);
for (const week of weeks) console.log(describeWeek(week));
