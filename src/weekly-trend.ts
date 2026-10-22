import type { ReactionRecord } from "./reaction-classifier.ts";

const DAYS_PER_WEEK = 7;

export interface WeekTrend {
  weekStart: Date;
  reactions: number;
  corrections: number;
  confusions: number;
  rulesUpdates: number;
}

export function startOfWeek(time: Date): Date {
  const weekStart = new Date(time.getFullYear(), time.getMonth(), time.getDate());
  const daysSinceMonday = (weekStart.getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);
  return weekStart;
}

function addWeek(weekStart: Date): Date {
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + DAYS_PER_WEEK);
  return nextWeekStart;
}

export function weeklyTrend(records: ReactionRecord[], rulesAppliedTimes: Date[]): WeekTrend[] {
  if (records.length === 0) return [];
  const promptTimes = records.map((record) => new Date(record.promptTime));
  const eventMilliseconds = [...promptTimes, ...rulesAppliedTimes].map((time) => time.getTime());
  const lastWeekStart = startOfWeek(new Date(Math.max(...eventMilliseconds)));
  const weeks: WeekTrend[] = [];
  for (
    let weekStart = startOfWeek(new Date(Math.min(...eventMilliseconds)));
    weekStart <= lastWeekStart;
    weekStart = addWeek(weekStart)
  ) {
    const nextWeekStart = addWeek(weekStart);
    const isInWeek = (time: Date) => time >= weekStart && time < nextWeekStart;
    const weekRecords = records.filter((_, index) => isInWeek(promptTimes[index]));
    weeks.push({
      weekStart,
      reactions: weekRecords.length,
      corrections: weekRecords.filter((record) => record.label === "correction").length,
      confusions: weekRecords.filter((record) => record.label === "confusion").length,
      rulesUpdates: rulesAppliedTimes.filter(isInWeek).length,
    });
  }
  return weeks;
}
