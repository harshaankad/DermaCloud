// IST is fixed UTC+5:30, no DST. All clinics are India-based.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toIST(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

function fromIST(date: Date): Date {
  return new Date(date.getTime() - IST_OFFSET_MS);
}

/** "HH:MM" in IST for the given instant (defaults to now). */
export function istHHMM(date: Date = new Date()): string {
  const ist = toIST(date);
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** UTC Date representing IST 00:00 of the IST-day that contains `date`. */
export function startOfDayIST(date: Date = new Date()): Date {
  const ist = toIST(date);
  const istMidnight = new Date(Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate(),
    0, 0, 0, 0
  ));
  return fromIST(istMidnight);
}

/** UTC Date representing IST 23:59:59.999 of the IST-day that contains `date`. */
export function endOfDayIST(date: Date = new Date()): Date {
  const ist = toIST(date);
  const istEnd = new Date(Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate(),
    23, 59, 59, 999
  ));
  return fromIST(istEnd);
}

/** Add `days` IST-days to an IST day-boundary date. */
export function addDaysIST(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** UTC Date representing IST 00:00 of the first day of the IST month containing `date`. */
export function startOfMonthIST(date: Date = new Date()): Date {
  const ist = toIST(date);
  const istFirst = new Date(Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    1, 0, 0, 0, 0
  ));
  return fromIST(istFirst);
}
