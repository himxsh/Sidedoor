# Video shot list (under 3:00, PLAN.md §7)

Before recording:

```bash
npm start
```

```bash
curl -XPOST 'localhost:4400/__layout?set=a'
```

Open http://localhost:3030 (dashboard) and http://localhost:4400 (portal) side by side, plus a terminal and Claude Code in this folder. Repairs take about 3 minutes, so record the 1:30 segment live and speed it up, or cut between its events.

| Time | Shot | Exact action |
|---|---|---|
| 0:00–0:20 | The problem | Claude Code: "What's the latest notice on the campus portal?" Without Sidedoor it has no tool; show the portal page with no API. |
| 0:20–1:00 | One sentence → endpoint | Dashboard form: name `fees2`, URL `http://localhost:4400/fees`, inputs `student_id=S1001`, sentence "Type {{student_id}} into the Student ID field and click Check fees. Store the amount shown next to 'Amount due' as 'amount_due'." Kane steps stream into the timeline. Then `curl 'localhost:3030/api/fees2?student_id=S1004'` returns JSON. Point at the "Credits spent" tile: one paid recording. |
| 1:00–1:30 | Agent uses it | Claude Code (`.mcp.json` loaded): "Check fees for S1002, then file a leave request for Riya from 2026-11-26 to 2026-11-27, reason Medical." It calls `fees`, then `leave_request`, which returns `LR-41xx`. |
| 1:30–2:20 | **The repair** (lead with this if the cut feels slow) | `curl -XPOST 'localhost:4400/__layout?set=b'`; show the portal redesigned. Try-it box: `notices`, tick "Skip cache", Call. Timeline: REPLAY → CONTRACT ("boolean where text was expected") → RE-RECORD → CHECK fails → "Retrying with Kane's own fix" → CHECK passes → VERIFY → SWAP. The badge stays healthy and the result says `repaired: true`. |
| 2:20–2:45 | Build hook | Show `evidence/build-hook/failed-*-dashboard.png` and the hook's stderr: Kane failed "the status badge next to the name 'quotes' contains the text 'healthy'", the edit was blocked, and the fix followed. Mention the honest false pass in `evidence/build-hook/false-pass/`. |
| 2:45–3:00 | Totals + install | Dashboard tiles (endpoints, calls served, repairs, credits spent vs saved). End on `git clone … && npm install && npm start` and the live link. |

Afterwards: upload as **unlisted**, open the link in a private window, and paste it into the README.

To reset the demo afterwards:

```bash
curl -XPOST 'localhost:4400/__layout?set=a'
```

```bash
npx tsx src/cli.ts create --force --name notices --url http://localhost:4400/ "Store the title of the most recent notice as 'title' and store its date as 'date'."
```
