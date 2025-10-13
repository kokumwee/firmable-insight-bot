export function daysSince(dateISO?: string | null, tz = 'Australia/Melbourne'): number | null {
  if (!dateISO) return null;
  const now = new Date();
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const then = new Date(new Date(dateISO).toLocaleString('en-US', { timeZone: tz }));
  const ms = +localNow - +then;
  return ms < 0 ? 0 : Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function lastContactLabel(dateISO?: string | null): string {
  const d = daysSince(dateISO);
  if (d === null) return 'No contact yet';
  if (d === 0) return 'Contacted today';
  if (d === 1) return 'No contact for 1 day';
  return `No contact for ${d} days`;
}
