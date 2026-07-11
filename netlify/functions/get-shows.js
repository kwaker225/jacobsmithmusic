exports.handler = async function(event, context) {
  const CALENDAR_ID = '98cc39737cd9ee73be21c0804608863bd56247dcf8c4bfe4441e5c3ad07412e9@group.calendar.google.com';
  const API_KEY = process.env.GOOGLE_CALENDAR_API_KEY;

  const now = new Date().toISOString();
  const oneYearFromNow = new Date(Date.now() + 365*24*60*60*1000).toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?key=${API_KEY}&timeMin=${now}&timeMax=${oneYearFromNow}&singleEvents=true&orderBy=startTime&maxResults=50`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: data.error?.message || 'Failed to fetch calendar' })
      };
    }

    const shows = (data.items || []).map(item => {
      const start = item.start?.dateTime || item.start?.date;
      const date = start ? start.slice(0, 10) : '';
      const dateObj = new Date(date + 'T00:00:00');
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const day = days[dateObj.getDay()];
      const display = `${months[dateObj.getMonth()]} ${dateObj.getDate()}`;

      // Parse time from dateTime if available
      let time = 'TBD';
      if (item.start?.dateTime && item.end?.dateTime) {
        const startTime = new Date(item.start.dateTime);
        const endTime = new Date(item.end.dateTime);
        const fmt = t => {
          let h = t.getHours(), m = t.getMinutes(), ampm = h >= 12 ? 'PM' : 'AM';
          h = h % 12 || 12;
          return m === 0 ? `${h}:00 ${ampm}` : `${h}:${String(m).padStart(2,'0')} ${ampm}`;
        };
        time = `${fmt(startTime)}–${fmt(endTime)}`;
      }

      // Get venue URL from description or location
      let url = '';
      if (item.description) {
        const match = item.description.match(/https?:\/\/[^\s]+/);
        if (match) url = match[0];
      }
      if (!url && item.location) {
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`;
      }

      return {
        date,
        display,
        day,
        venue: item.summary || 'TBD',
        city: item.location || '',
        time,
        url
      };
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
      body: JSON.stringify({ error: err.message })
    };
  }
};
