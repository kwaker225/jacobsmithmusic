// Returns Jacob's latest Facebook Page posts, newest first:
// [{ text, created, link, image }]
// Needs two Netlify environment variables (never put these in the code):
//   FB_PAGE_ID    - the Page's numeric ID
//   FB_PAGE_TOKEN - a non-expiring Page access token with pages_read_engagement + pages_read_user_content
// If either is missing or Facebook errors, it returns 503 and the home page
// shows a plain "See posts on Facebook" card instead.
const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || 'v26.0';
const LIMIT = 6;

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  // Cache 15 min at the edge so we stay far below Facebook's rate limits
  'Cache-Control': 'public, max-age=900'
};

exports.handler = async function () {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;
  if (!pageId || !token) {
    return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ error: 'not configured' }) };
  }

  const url = 'https://graph.facebook.com/' + GRAPH_VERSION + '/' + encodeURIComponent(pageId)
    + '/posts?fields=message,created_time,permalink_url,full_picture&limit=' + (LIMIT * 2)
    + '&access_token=' + encodeURIComponent(token);

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      // Log Facebook's reason for the Netlify function log, but never the token
      console.log('Facebook API error', res.status, data && data.error && data.error.message);
      return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ error: 'facebook error' }) };
    }
    const posts = (data.data || [])
      .filter(function (p) { return p.permalink_url && (p.message || p.full_picture); })
      .slice(0, LIMIT)
      .map(function (p) {
        return {
          text: p.message || '',
          created: p.created_time || '',
          link: p.permalink_url,
          image: p.full_picture || ''
        };
      });
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify(posts) };
  } catch (e) {
    console.log('Facebook fetch failed', e.message);
    return { statusCode: 503, headers: HEADERS, body: JSON.stringify({ error: 'fetch failed' }) };
  }
};
