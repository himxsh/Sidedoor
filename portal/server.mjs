// Local Campus Portal server: `node portal/server.mjs` (port 4400, or PORTAL_PORT).
import http from "node:http";
import { handle } from "./app.mjs";

const port = Number(process.env.PORTAL_PORT || 4400);
http
  .createServer((req, res) => {
    handle(req, res).catch((err) => {
      res.statusCode = 500;
      res.end(String(err));
    });
  })
  .listen(port, () => console.log(`Campus Portal on http://localhost:${port}`));
