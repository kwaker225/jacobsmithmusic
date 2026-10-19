// Returns Jacob's YouTube Shorts, newest first: [{ id, title, published }]
// Uses the YouTube Data API when a key is available (gets every Short),
// and falls back to YouTube's public RSS feed (latest 15) when it isn't.
const CHANNEL_ID = 'UCQiXpbxThmBPpeWH8byj0gg';
const SHORTS_PLAYLIST = 'UUSH' + CHANNEL_ID.slice(2); // YouTube's built-in "Shorts only" playlist
const MAX_SHORTS = 200;

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600'
};

async function fromApi(key) {
  const out = [];
  let pageToken = '';
  do {
    const url = 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50'
      + '&playlistId=' + SHORTS_PLAYLIST + '&key=' + key + (pageToken ? '&pageToken=' + pageToken : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error('YouTube API ' + res.status);
    const data = await res.json();
    (data.items || []).forEach(function (it) {
      const s = it.snippet || {};
      if (s.title === 'Private video' || s.title === 'Deleted video') return;
      out.push({
        id: (it.contentDetails && it.contentDetails.videoId) || (s.resourceId && s.resourceId.videoId),
        title: s.title || '',
        published: (it.contentDetails && it.contentDetails.videoPublishedAt) || s.publishedAt || ''
      });
    });
    pageToken = data.nextPageToken || '';
  } while (pageToken && out.length < MAX_SHORTS);
  return out;
}

function decode(str) {
  return str.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function fromRss(query) {
  const res = await fetch('https://www.youtube.com/feeds/videos.xml?' + query);
  if (!res.ok) throw new Error('RSS ' + res.status);
  const xml = await res.text();
  const entries = xml.split('<entry>').slice(1);
  return entries.map(function (e) {
    const pick = function (re) { const m = e.match(re); return m ? decode(m[1]) : ''; };
    return {
      id: pick(/<yt:videoId>([^<]+)<\/yt:videoId>/),
      title: pick(/<title>([^<]*)<\/title>/),
      published: pick(/<published>([^<]+)<\/published>/),
      isShort: /\/shorts\//.test(pick(/<link rel="alternate" href="([^"]+)"/))
    };
  }).filter(function (v) { return v.id; });
}

exports.handler = async function () {
  const key = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_CALENDAR_API_KEY;
  let shorts = null;
  let source = '';

  if (key) {
    try { shorts = await fromApi(key); source = 'api'; } catch (e) { shorts = null; }
  }
  if (!shorts || !shorts.length) {
    try { shorts = await fromRss('playlist_id=' + SHORTS_PLAYLIST); source = 'rss-shorts'; } catch (e) { shorts = null; }
  }
  if (!shorts || !shorts.length) {
    try {
      const all = await fromRss('channel_id=' + CHANNEL_ID);
      shorts = all.filter(function (v) { return v.isShort; });
      source = 'rss-channel';
    } catch (e) { shorts = null; }
  }

  if (!shorts) {
    return { statusCode: 502, headers: HEADERS, body: JSON.stringify({ error: 'Could not load Shorts' }) };
  }

  shorts = shorts.map(function (v) { return { id: v.id, title: v.title, published: v.published }; })
    .sort(function (a, b) { return (b.published || '').localeCompare(a.published || ''); });

  return {
    statusCode: 200,
    headers: Object.assign({ 'X-Shorts-Source': source }, HEADERS),
    body: JSON.stringify(shorts)
  };
};
