// Generates .ics file content (universal: Apple Calendar, Outlook, etc)
export function generateICS(event: {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  location?: string;
  attendees?: string[];
}): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  let ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lone OS//Meetings//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(event.startAt)}`,
    `DTEND:${fmt(event.endAt)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description.replace(/\n/g, "\\n")}`,
  ];

  if (event.location) ics.push(`LOCATION:${event.location}`);
  if (event.attendees) {
    for (const email of event.attendees) {
      ics.push(`ATTENDEE;RSVP=TRUE:mailto:${email}`);
    }
  }

  ics.push(`UID:${Date.now()}@loneos`, "STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR");
  return ics.join("\r\n");
}

// Generates Google Calendar URL (opens in browser/app)
export function generateGoogleCalendarUrl(event: {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  location?: string;
}): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    details: event.description,
    dates: `${fmt(event.startAt)}/${fmt(event.endAt)}`,
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Download .ics file
export function downloadICS(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
