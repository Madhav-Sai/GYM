// Spec §4 cardio plans. HR is a target band in bpm; ceiling 175 is a hard rule (spec §9).
export const HR_CEILING = 175;
export const ZONE45_WEEKLY_TARGET_MIN = [20, 25] as const;
export const ZONE45_WEEKLY_WARN_MIN = 30;

export interface CardioStep { fromMin: number; toMin: number; speedKmh: number | [number, number]; inclinePct: number; hr?: string; note?: string }
export interface CardioPlan { key: string; title: string; durationMin: number; steps: CardioStep[]; note?: string }

export const CARDIO_PLANS: Record<string, CardioPlan> = {
  steady: {
    key: "steady", title: "Steady cardio", durationMin: 35,
    steps: [
      { fromMin: 0, toMin: 3, speedKmh: 4.5, inclinePct: 0, hr: "100-110" },
      { fromMin: 3, toMin: 5, speedKmh: 5.5, inclinePct: 4, hr: "120-135" },
      { fromMin: 5, toMin: 25, speedKmh: 6.0, inclinePct: 9, hr: "145-160" },
      { fromMin: 25, toMin: 30, speedKmh: 6.0, inclinePct: 12, hr: "165-170" },
      { fromMin: 30, toMin: 33, speedKmh: 5.0, inclinePct: 3, hr: "130" },
      { fromMin: 33, toMin: 35, speedKmh: 4.0, inclinePct: 0, hr: "<120" },
    ],
  },
  intervals: {
    key: "intervals", title: "Intervals", durationMin: 30,
    note: "3 rounds now. 4th round unlocks at week 3.",
    steps: [
      { fromMin: 0, toMin: 3, speedKmh: 4.5, inclinePct: 0, note: "warm up" },
      { fromMin: 3, toMin: 5, speedKmh: 5.5, inclinePct: 5, hr: "125-140" },
      { fromMin: 5, toMin: 8, speedKmh: 6.0, inclinePct: 12, hr: "165-175", note: "HARD" },
      { fromMin: 8, toMin: 11, speedKmh: 4.0, inclinePct: 0, note: "recover to 135" },
      { fromMin: 11, toMin: 14, speedKmh: 6.0, inclinePct: 12, hr: "165-175", note: "HARD" },
      { fromMin: 14, toMin: 17, speedKmh: 4.0, inclinePct: 0, note: "recover to 135" },
      { fromMin: 17, toMin: 20, speedKmh: 6.0, inclinePct: 12, hr: "165-175", note: "HARD" },
      { fromMin: 20, toMin: 30, speedKmh: [4.0, 3.5], inclinePct: 0, note: "cool down" },
    ],
  },
  post_lift: {
    key: "post_lift", title: "Post-lift treadmill", durationMin: 20,
    steps: [
      { fromMin: 0, toMin: 2, speedKmh: 4.0, inclinePct: 0 },
      { fromMin: 2, toMin: 17, speedKmh: 5.5, inclinePct: 5, hr: "120-140" },
      { fromMin: 17, toMin: 20, speedKmh: 4.0, inclinePct: 0 },
    ],
  },
};

/** Weekly plan by IST weekday label. Sunday is rest. */
export const WEEK_PLAN: Record<string, { lift?: string; cardio?: string; rest?: boolean }> = {
  Mon: { lift: "Upper A", cardio: "post_lift" },
  Tue: { lift: "Lower A", cardio: "post_lift" },
  Wed: { cardio: "steady" },
  Thu: { lift: "Upper B", cardio: "post_lift" },
  Fri: { lift: "Lower B", cardio: "post_lift" },
  Sat: { cardio: "intervals" },
  Sun: { rest: true },
};
