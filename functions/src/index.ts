import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { runWeeklySnapshot } from "./weekly/snapshot";

initializeApp();

/**
 * Every Monday at 09:00 India time: records the final belt standing of each active advisor for the competition
 * week that just ended (Monday 09:00 to Monday 09:00) into weekly_results (functions/src/weekly/snapshot.ts).
 * Belts are the sole ranking — red < 200, yellow 200-349, blue 350-500, green 501+ entries that week — so there
 * is no promotion, demotion or level history. Uses the scheduled time, not the clock, so a retry or a late start
 * still snapshots the same week, and a second run for that week changes nothing.
 */
export const weeklySnapshot = onSchedule(
  {
    // Minute 0, hour 9 (09:00), any day of month, any month, day-of-week 1 (Monday), in Asia/Kolkata.
    schedule: "0 9 * * 1",
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    retryCount: 3,
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async (event) => {
    const summary = await runWeeklySnapshot(getFirestore(), new Date(event.scheduleTime));
    logger.info("Weekly belt snapshot finished", summary);
  },
);
