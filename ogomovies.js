/*
 * Module: ogomovies.js
 *
 * This module provides scraping functions for the ogomovies.com.pk website.
 * It is designed to be used with the Sora app in “normal JavaScript mode”.
 * Each exported function accepts the raw HTML of a page and extracts the
 * relevant information.  The searchResults function parses the search
 * results page and returns a list of result objects.  extractDetails
 * pulls a description, original title and release date from a movie
 * detail page.  extractEpisodes attempts to extract episode links for
 * multi‑episode content (though most titles on this site are treated as
 * movies).  extractStreamUrl finds the first embedded iframe within the
 * player container and returns its source URL.  If no iframe is found
 * the function falls back to the first iframe on the page.
 */

function searchResults(html) {
    const results = [];
    // The search results page contains one or more <div class="result-item">
    // containers.  Each of these holds an <article> with an image, title
    // and a link to the detail page.  Use a global regular expression to
    // find each result block and then extract the pieces we need.
    const itemRegex = /<div class="result-item">[\s\S]*?<\/article>/g;
    const items = html.match(itemRegex) || [];
    items.forEach(itemHtml => {
        // Extract the URL of the detail page
        const hrefMatch = itemHtml.match(/<a\s+href="([^\"]+)"/);
        // Extract the poster image
        const imgMatch = itemHtml.match(/<img[^>]+src="([^\"]+)"/);
        // Extract the title from the nested <div class="title">
        const titleMatch = itemHtml.match(/<div\s+class="title">\s*<a[^>]*>([^<]+)<\/a>/);
        const href = hrefMatch ? hrefMatch[1] : '';
        const image = imgMatch ? imgMatch[1] : '';
        const title = titleMatch ? titleMatch[1] : '';
        if (href && title) {
            results.push({
                title: title.trim(),
                image: image.trim(),
                href: href.trim()
            });
        }
    });
    return results;
}

function extractDetails(html) {
    const details = [];
    // Pull the synopsis text.  The synopsis is contained in a <div>
    // immediately following a <h2>Synopsis</h2> heading.  Grab the first
    // paragraph inside that container.
    const descMatch = html.match(/<h2>\s*Synopsis\s*<\/h2>[\s\S]*?<div[^>]*itemprop="description"[^>]*>\s*<p>([\s\S]*?)<\/p>/i);
    let description = descMatch ? descMatch[1] : '';
    // Strip any nested HTML tags from the description
    if (description) {
        description = description.replace(/<[^>]+>/g, '').trim();
    }
    // Original title appears in a custom fields section labelled
    // “Original title”.  Capture the value from the adjacent <span>.
    const aliasMatch = html.match(/<b[^>]*>\s*Original\s+title\s*<\/b>\s*<span[^>]*>([^<]+)<\/span>/i);
    const aliases = aliasMatch ? aliasMatch[1].trim() : '';
    // Extract the release date from the movie info header.  The date is
    // contained in a <span class="date"> element with itemprop="dateCreated".
    const airdateMatch = html.match(/<span\s+class="date"[^>]*>([^<]+)<\/span>/i);
    const airdate = airdateMatch ? airdateMatch[1].trim() : '';
    if (description || aliases || airdate) {
        details.push({
            description: description || 'N/A',
            aliases: aliases || 'N/A',
            airdate: airdate || 'N/A'
        });
    }
    return details;
}

function extractEpisodes(html) {
    const episodes = [];
    // For series, episodes are listed inside <li> elements with class
    // “episodiotitle”.  Each contains an <a> with the episode link and a
    // <div class="numerando"> with the episode number.  Use a global
    // regex to pull out each entry.
    const epRegex = /<li[^>]*class="episodiotitle"[\s\S]*?<a[^>]+href="([^\"]+)"[\s\S]*?<div[^>]*class="numerando"[^>]*>\s*([^<]+)\s*<\/div>/gi;
    let match;
    while ((match = epRegex.exec(html)) !== null) {
        const href = match[1];
        const number = match[2];
        episodes.push({
            href: href,
            number: number.trim()
        });
    }
    // If no episodes are found, assume it is a movie.  In this case
    // we still need to return a single entry so that Sora will have
    // something to work with.  Use the canonical URL from meta tags
    // as the href for this default episode.  If no canonical URL is
    // available, return an empty list as a final fallback.
    if (episodes.length === 0) {
        // Attempt to find a canonical URL or og:url meta tag
        let url = '';
        const ogMatch = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i);
        if (ogMatch) {
            url = ogMatch[1];
        } else {
            const canonMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
            if (canonMatch) {
                url = canonMatch[1];
            }
        }
        if (url) {
            return [
                {
                    href: url,
                    number: '1'
                }
            ];
        }
        return [];
    }
    return episodes;
}

function extractStreamUrl(html) {
    // Locate the first iframe inside the player container.  On ogomovies
    // this iframe has classes “metaframe rptss”.
    const iframeMatch = html.match(/<iframe[^>]+class="[^"]*metaframe[^"]*"[^>]+src="([^\"]+)"/i);
    if (iframeMatch) {
        return iframeMatch[1];
    }
    // Fallback: return the source of the first iframe on the page
    const anyIframe = html.match(/<iframe[^>]+src="([^\"]+)"/i);
    return anyIframe ? anyIframe[1] : null;
}

// Export functions for Sora
module.exports = {
    searchResults,
    extractDetails,
    extractEpisodes,
    extractStreamUrl
};