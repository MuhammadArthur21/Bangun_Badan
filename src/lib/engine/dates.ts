const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export function epochDay(dateKey: string): number {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) {
    throw new RangeError(`Tanggal harus berformat YYYY-MM-DD: ${dateKey}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`Tanggal tidak valid: ${dateKey}`);
  }

  return Math.floor(timestamp / DAY_IN_MILLISECONDS);
}

export function dateKeyFromEpochDay(day: number): string {
  if (!Number.isInteger(day)) {
    throw new RangeError("Hari epoch harus bilangan bulat.");
  }

  const date = new Date(day * DAY_IN_MILLISECONDS);
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function addDays(dateKey: string, amount: number): string {
  if (!Number.isInteger(amount)) {
    throw new RangeError("Jumlah hari harus bilangan bulat.");
  }
  return dateKeyFromEpochDay(epochDay(dateKey) + amount);
}

export function weekday(dateKey: string): number {
  return new Date(epochDay(dateKey) * DAY_IN_MILLISECONDS).getUTCDay();
}

export function dateKeyInTimezone(
  instant: Date,
  timezone = "Asia/Jakarta",
): string {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("Waktu yang diberikan tidak valid.");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const fields = new Map(parts.map(({ type, value }) => [type, value]));
  const year = fields.get("year");
  const month = fields.get("month");
  const day = fields.get("day");

  if (!year || !month || !day) {
    throw new Error(`Tidak dapat menentukan tanggal untuk zona ${timezone}.`);
  }

  return `${year}-${month}-${day}`;
}

export function monthDateKeys(monthKey: string): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    throw new RangeError(`Bulan harus berformat YYYY-MM: ${monthKey}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const firstDay = `${match[1]}-${match[2]}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  epochDay(firstDay);

  return Array.from({ length: daysInMonth }, (_, index) =>
    addDays(firstDay, index),
  );
}
