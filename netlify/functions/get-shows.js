// Official website, clean name and town for each venue Jacob plays.
// Matched against the Google Calendar event title + location, so the
// calendar entries never need editing. First match wins. Venues not listed
// here fall back to a link in the event description, then Google Maps.
const VENUES = [
  { match: /columbia|colombia|district detroit/i, name: 'Music On Columbia, The District Detroit', city: 'Detroit, MI', url: 'https://www.thedistrictdetroit.com/' },
  { match: /jezeb|jezzeb/i, name: 'Jezebels Saloon', city: 'Brighton, MI', url: 'https://www.jezebelssaloon.com' },
  { match: /bad benny/i, name: "Bad Benny's Pour House", city: 'Highland Twp, MI', url: 'https://badbennyshighland.com' },
  { match: /hallboy/i, name: 'Hallboy Barbeque', city: 'Hartland, MI', url: 'https://www.facebook.com/HallboyBBQ/' },
  { match: /sunny\s*sips/i, name: 'SunnySips Bar & Grill', city: 'Howell, MI', url: 'https://www.sunnysipsbarandgrill.com' },
  { match: /williamston roadhouse/i, name: 'Williamston Roadhouse', city: 'Williamston, MI', url: 'https://www.williamstonroadhouse.com' },
  { match: /walled lake tavern/i, name: 'Walled Lake Tavern', city: 'Walled Lake, MI', url: 'https://walledlaketavernmi.com' },
  { match: /bait\s*shop/i, name: 'Belleville Bait Shop Bar & Grill', city: 'Belleville, MI', url: 'https://www.facebook.com/BellevilleBaitshopBar/' },
  { match: /cleats/i, name: 'Cleats Bar & Grille', city: 'Lansing, MI', url: 'https://www.cleatsbarandgrille.com' },
  { match: /tap-?ins?\b|tap-in's/i, name: "Tap-In's", city: 'Howell, MI', url: 'https://tap-ins.com/' },
  { match: /\bm\.?d'?s\b.*tavern/i, name: "MD's Sports Tavern & Grill", city: 'Davison, MI', url: 'https://mdsportstavern.com/' },
  { match: /four circles/i, name: 'Four Circles Brewery', city: 'Brighton, MI', url: 'https://fourcirclesbrewery.com' },
  { match: /willow\s*brook/i, name: 'Willow Brook Golf Course & Restaurant', city: 'Byron, MI', url: 'https://golfbyron.com' },
  { match: /dunham hills/i, name: 'Dunham Hills Golf Club', city: 'Hartland, MI', url: 'https://www.dunhamhills.com' },
  { match: /tyrone hills/i, name: 'Tyrone Hills Golf Club', city: 'Fenton, MI', url: 'https://www.tyronehillsgolf.com' },
  { match: /flint art fair|flint institute of arts|1120 e kearsley/i, name: null, city: 'Flint, MI', url: 'https://www.flintarts.org/' },
  { match: /hartland ice house/i, name: 'Hartland Ice House', city: 'Hartland, MI', url: 'https://www.hartlandicehouse.com/' },
  { match: /plymouth orchards|10685 warren/i, name: 'Plymouth Orchards & Cider Mill', city: 'Plymouth, MI', url: 'https://www.plymouthorchards.com' },
  { match: /popp'?s place/i, name: "Popp's Place", city: 'Merrill, MI', url: '' }, // no official site found yet: falls back to Google Maps
  { match: /lost arrow/i, name: 'Lost Arrow Resort On the Water', city: 'Gladwin, MI', url: 'https://www.facebook.com/LostArrowResortOnTheWater/' }
];

function findVenue(summary, location) {
  const text = `${summary || ''} ${location || ''}`;
  return VENUES.find(v => v.match.test(text)) || null;
}

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

      // Known venue? Use its official site, clean name and town
      const known = findVenue(item.summary, item.location);

      // Venue name = clean name for known venues, else the event title
      const title = (item.summary && item.summary.trim()) ? item.summary.trim() : 'TBD';
      const venue = (known && known.name) || title;

      // City: shorten a full street address to "City, ST" when possible
      let city = item.location || '';
      if (city) {
        // Try to pull "City, ST" out of a full address like "..., Byron, MI 48418, USA"
        const m = city.match(/([A-Za-z .'-]+),\s*([A-Z]{2})\b/);
        if (m) city = `${m[1].trim()}, ${m[2]}`;
      }
      if (known) city = known.city;

      // Link: venue's official site, else first URL in description,
      // else a Maps search on the location
      let link = known ? known.url : '';
      if (!link && item.description) {
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
