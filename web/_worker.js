// Cloudflare Pages entry (advanced mode). One site:
//   /          the Sidedoor dashboard (static files in web/, playback of real recorded runs)
//   /campus/*  the demo Campus Portal, run from portal/app.mjs (add ?layout=b to see the redesign)
import { handle } from "../portal/app.mjs";

const PREFIX = "/campus";

async function portal(request) {
  const url = new URL(request.url);
  url.pathname = url.pathname.slice(PREFIX.length) || "/";
  const body = request.method === "POST" ? await request.text() : "";
  const req = { url: url.toString(), method: request.method, headers: Object.fromEntries(request.headers), body };
  let status = 200;
  let out = "";
  const headers = new Headers();
  const res = {
    set statusCode(s) { status = s; },
    get statusCode() { return status; },
    setHeader: (k, v) => headers.set(k, v),
    end: (b = "") => { out = b; },
  };
  await handle(req, res);
  // The portal links with absolute paths; keep them inside /campus.
  if ((headers.get("content-type") || "").startsWith("text/html")) out = out.replace(/(href|action)="\//g, `$1="${PREFIX}/`);
  return new Response(out, { status, headers });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === PREFIX || pathname.startsWith(PREFIX + "/")) return portal(request);
    return env.ASSETS.fetch(request);
  },
};
