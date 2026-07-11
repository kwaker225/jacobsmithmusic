exports.handler = async function(event, context) {
  const CALENDAR_ID = '98cc39737cd9ee73be21c0804608863bd56247dcf8c4bfe4441e5c3ad07412e9@group.calendar.google.com';
  const API_KEY = process.env.GOOGLE_CALENDAR_API_KEY;
  const TZ = 'America/Detroit';

  const now = new Date().toISOString();
  const oneYearFromNow = new Date(Date.now() + 365*24*60*60*1000).toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?key=${API_KEY}&timeMin=${now}&timeMax=${oneYearFromNow}&singleEvents=true&orderBy=startTime&maxResults=50`;

  // Format a Date into Eastern-time parts using Intl (handles DST automatically)
  function partsInTZ(d) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true, year: 'numeric'
    });
    const p = {};
    fmt.formatToParts(d).forEach(x => { p[x.type] = x.value; });
    return p; // {weekday, month, day, hour, minute, dayPeriod, year}
  }
  // Eastern-time YYYY-MM-DD for a Date (for accurate date + past filtering)
  function ymdInTZ(d) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' });
    return f.format(d); // en-CA gives YYYY-MM-DD
  }
  function fmtTime(p) {
    return p.minute === '00' ? `${p.hour}:00 ${p.dayPeriod}` : `${p.hour}:${p.minute} ${p.dayPeriod}`;
  }

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: data.error?.message || 'Failed to fetch calendar' })
      };
    }

    const shows = (data.items || []).map(item => {
      const startRaw = item.start?.dateTime || item.start?.date;
      const isTimed = !!item.start?.dateTime;

      let date, day, display, time = 'TBD';

      if (isTimed) {
        const startD = new Date(item.start.dateTime);
        const sp = partsInTZ(startD);
        date = ymdInTZ(startD);
        day = sp.weekday;
        display = `${sp.month} ${sp.day}`;
        if (item.end?.dateTime) {
          const ep = partsInTZ(new Date(item.end.dateTime));
          time = `${fmtTime(sp)}–${fmtTime(ep)}`;
        } else {
          time = fmtTime(sp);
        }
      } else {
        // All-day event: date is already YYYY-MM-DD in local calendar terms
        date = startRaw;
        const d = new Date(startRaw + 'T12:00:00');
        const p = partsInTZ(d);
        day = p.weekday;
        display = `${p.month} ${p.day}`;
      }

      // Venue name = event title
      const venue = (item.summary && item.summary.trim()) ? item.summary.trim() : 'TBD';

      // City: shorten a full street address to "City, ST" when possible
      let city = item.location || '';
      if (city) {
        // Try to pull "City, ST" out of a full address like "..., Byron, MI 48418, USA"
        const m = city.match(/([A-Za-z .'-]+),\s*([A-Z]{2})\b/);
        if (m) city = `${m[1].trim()}, ${m[2]}`;
      }

      // Link: first URL in description, else a Maps search on the location
      let link = '';
      if (item.description) {
        const match = item.description.match(/https?:\/\/[^\s"'<]+/);
        if (match) link = match[0];
      }
      if (!link && item.location) {
        link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`;
      }

      return { date, display, day, venue, city, time, url: link };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      },
      body: JSON.stringify(shows)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
