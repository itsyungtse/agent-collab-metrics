import { readRulesReminderInterval, saveRulesReminderInterval } from "./local-data.ts";

const newInterval = process.argv[2];
if (newInterval === undefined) {
  console.log(`rules reminder every ${readRulesReminderInterval()} classified replies`);
} else if (/^[1-9]\d*$/.test(newInterval)) {
  saveRulesReminderInterval(Number(newInterval));
  console.log(`rules reminder every ${newInterval} classified replies`);
} else {
  console.error("usage: interval.ts [replies], where replies is a whole number above 0");
  process.exitCode = 1;
}
