/*
 * Sora module script for OgoMovies (ogomovies.com.pk)
 *
 * This module is written for Sora's asynchronous JavaScript mode.  It uses
 * the built‑in `fetchv2` function to communicate with the WordPress API
 * exposed by OgoMovies and to fetch individual HTML pages.  By leveraging
 * the API for search and basic details we avoid scraping dynamically
 * generated search pages.  When extracting the stream URL the script
 * downloads the movie page itself and looks for the embedded player
 * iframe.
 *
 * The search API returns only the title and URL of each movie, so this
 * script fetches each movie page in order to obtain a poster image from
 * the `<meta property="og:image" ...>` tag.  To minimise network traffic
 * the number of search results is capped at 10.  Should an image not be
 * present the image field will be left blank.
 *
 * The extractDetails function relies on the WordPress API to fetch
 * structured metadata about a movie.  It strips HTML tags from the
 * description and attempts to derive the release year from the slug in
 * the movie URL.  If the API does not return any data the function
 * gracefully falls back to empty fields.
 *
 * Movies on OgoMovies do not expose episode information because each
 * post represents a single film.  Sora nevertheless expects at least
 * one episode entry so that it can call `extractStreamUrl`.  The
 * extractEpisodes function therefore returns a single episode whose
 * `href` points back to the movie page and whose `number` is "1".
 *
 * The extractStreamUrl function parses the movie page for the first
 * `<iframe>` element with the `metaframe` class.  The `src` attribute
 * of that iframe contains the URL of the embedded player on the
 * remote streaming host.  This is returned to Sora.  Should no
 * matching iframe be found the function returns `null`.
 */

async function searchResults(keyword) {
  try {
    const encoded = encodeURIComponent(keyword.trim());
    // Use the WordPress search endpoint to retrieve matching movie posts.
    // Limit results to 10 to reduce the number of network calls.
    const searchUrl = `https://ogomovies.com.pk/wp-json/wp/v2/search?search=${encoded}&subtype=movies&per_page=10`;
    const response = await fetchv2(searchUrl);
    const data = await response.json();

    const results = [];
    for (const item of data) {
      const title = item.title || '';
      const href = item.url || '';
      let image = '';

      if (href) {
        // Fetch the movie page to extract the poster from the og:image meta tag.
        try {
          const pageRes = await fetchv2(href);
          const html = await pageRes.text();
          const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
          if (imgMatch && imgMatch[1]) {
            image = imgMatch[1].trim();
          }
        } catch (innerErr) {
          // Ignore errors fetching or parsing individual pages; leave image blank.
        }
      }

      // Only push a result if we have a title and href.
      if (title && href) {
        results.push({
          title: title.trim(),
          image: image,
          href: href.trim()
        });
      }
    }
    return JSON.stringify(results);
  } catch (error) {
    console.log('searchResults error:', error);
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    // Derive the slug from the movie URL.  The slug is the last segment of
    // the path (e.g. https://ogomovies.com.pk/movies/ronth-2025/ => ronth-2025).
    const slugMatch = url.match(/\/movies\/([^/?#]+)(?:\/?|$)/i);
    const slug = slugMatch ? slugMatch[1] : '';
    let description = '';
    let aliases = '';
    let airdate = '';

    if (slug) {
      // Query the WordPress API for this movie by slug.  The API returns
      // an array; we use the first element if present.
      const apiUrl = `https://ogomovies.com.pk/wp-json/wp/v2/movies?slug=${encodeURIComponent(slug)}`;
      const res = await fetchv2(apiUrl);
      const posts = await res.json();
      if (Array.isArray(posts) && posts.length > 0) {
        const post = posts[0];
        // Extract the description from the rendered content and strip HTML tags.
        if (post.content && post.content.rendered) {
          const raw = post.content.rendered;
          const stripped = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          description = stripped || '';
        }
        // Use the rendered title as an alias (alternate name) if available.
        if (post.title && post.title.rendered) {
          aliases = post.title.rendered.replace(/<[^>]+>/g, '').trim();
        }
        // Attempt to derive the year from the slug using a four‑digit pattern.
        const yearMatch = slug.match(/(19|20)\d{2}/);
        airdate = yearMatch ? yearMatch[0] : '';
      }
    }
    const details = [{
      description: description || 'No description available',
      aliases: aliases || '',
      airdate: airdate || ''
    }];
    return JSON.stringify(details);
  } catch (error) {
    console.log('extractDetails error:', error);
    return JSON.stringify([{ description: '', aliases: '', airdate: '' }]);
  }
}

async function extractEpisodes(url) {
  try {
    // Movies on OgoMovies are single entries; however, Sora requires at
    // least one episode to trigger the streaming pipeline.  We return a
    // single episode pointing back to the movie page.
    const episodes = [{
      href: url,
      number: '1'
    }];
    return JSON.stringify(episodes);
  } catch (error) {
    console.log('extractEpisodes error:', error);
    return JSON.stringify([]);
  }
}

async function extractStreamUrl(url) {
  try {
    // Fetch the movie page and look for the first iframe with class containing
    // "metaframe".  The src attribute holds the external player URL.
    const res = await fetchv2(url);
    const html = await res.text();
    const iframeMatch = html.match(/<iframe[^>]*class="[^"]*metaframe[^"]*"[^>]*src="([^"]+)"/i);
    if (iframeMatch && iframeMatch[1]) {
      return iframeMatch[1];
    }
    return null;
  } catch (error) {
    console.log('extractStreamUrl error:', error);
    return null;
  }
}