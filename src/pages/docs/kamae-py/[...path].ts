// Void does not apply `_redirects` in front of an Astro Worker. This on-demand
// route lets legacy URLs without a prerendered page reach src/middleware.ts,
// which answers them with a 308.
export const prerender = false;

export const GET = () => new Response('Not Found', { status: 404 });
