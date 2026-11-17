// Vercel serverless entry for the hosted Campus Portal (deploy with portal/ as the project root).
// Layout state is per instance when hosted; use ?layout=b on any page to see layout B.
import { handle } from "../app.mjs";
export const config = { api: { bodyParser: false } };
export default (req, res) => handle(req, res);
