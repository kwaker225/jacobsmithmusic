// Returns Jacob's latest Facebook Page posts, newest first:
// { posts: [{ id, message, created, link, image }] }
//
// Needs two Netlify environment variables:
//   FB_PAGE_ID    - the Page's numeric id (not secret)
//   FB_PAGE_TOKEN - a read-only Page access token (secret, never sent to the browser)
// Optional:
//   FB_GRAPH_VERSION - e.g. "v24.0". When unset, Facebook uses the app's default version.
//
// If either required variable is missing or Facebook rejects the token, this returns
// an empty list with an error code, and the home page keeps showing Facebook's own widget.

const LIMIT = 6;
const FB_LINK = /^https:\/\/(www\.|m\.|web\.)?facebook\.com\//i;
const HTTPS = /^https:\/\//i;

function isoDate(t) {
  const d = new Date(t || '');
  return isNaN(d) ? '' : d.toISOString();
}

function reply(status, body, cacheable) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheable ? 'public, max-age=900' : 'no-store'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async function () {
  const pageId = (process.env.FB_PAGE_ID || '').trim();
  const token = (process.env.FB_PAGE_TOKEN || '').trim();
  if (!pageId || !token) return reply(503, { posts: [], error: 'not_configured' }, false);

  const version = (process.env.FB_GRAPH_VERSION || '').trim().replace(/^\/+|\/+$/g, '');
  const url = 'https://graph.facebook.com/' + (version ? version + '/' : '')
    + encodeURIComponent(pageId) + '/posts'
    + '?fields=message,created_time,permalink_url,full_picture'
    + '&limit=' + LIMIT
    + '&access_token=' + encodeURIComponent(token);

  let res, data;
  try {
    res = await fetch(url);
    data = await res.json();
  } catch (e) {
    // Never log the URL: it contains the token.
    return reply(502, { posts: [], error: 'unreachable' }, false);
  }

  if (!res.ok || !data || data.error) {
    const code = data && data.error && data.error.code;
    console.log('Facebook posts failed, Graph error code:', code || res.status);
    return reply(502, { posts: [], error: code === 190 ? 'token_invalid' : 'facebook_error' }, false);
  }

  const posts = (data.data || [])
    .filter(function (p) { return p && (p.message || p.full_picture) && FB_LINK.test(p.permalink_url || ''); })
    .map(function (p) {
      return {
        id: p.id,
        message: p.message || '',
        created: isoDate(p.created_time),
        link: p.permalink_url,
        image: HTTPS.test(p.full_picture || '') ? p.full_picture : ''
      };
    });

  return reply(200, { posts: posts }, true);
};
