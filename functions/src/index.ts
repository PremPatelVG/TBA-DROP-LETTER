import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { runWeeklyLevels } from "./levels/weekly";

initializeApp();

/**
 * Every Sunday at 12:00 noon India time: counts each advisor's letters for the competition week that just
 * ended (Sunday noon to Sunday noon) and applies the level rules (functions/src/levels/rules.ts). Uses the
 * scheduled time, not the clock, so a retry or a late start still checks the same week, and a second run for
 * that week changes nothing.
 */
export const weeklyLevels = onSchedule(
  {
    // Minute 0, hour 12 (noon), any day of month, any month, day-of-week 0 (Sunday), in Asia/Kolkata.
    schedule: "0 12 * * 0",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    retryCount: 3,
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async (event) => {
    const summary = await runWeeklyLevels(getFirestore(), new Date(event.scheduleTime));
    logger.info("Weekly level check finished", summary);
  },
);
