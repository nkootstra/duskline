const dateFormatter = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

export const dateLabel = (date: string | null): string =>
  date ? dateFormatter.format(new Date(`${date}T00:00:00Z`)) : "Unknown";

export const deletionCountdownLabel = (days: number): string => {
  if (days < 0) return "Deleted";
  if (days === 0) return "Today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
};
