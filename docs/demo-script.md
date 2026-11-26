# Demo script (under 3:00)

The story in one line: **"Kane does the browsing. Sidedoor makes a sentence into a tool that stays correct."** Every beat shows one piece of that line: the sentence, the tool, the replay, the contract and the repair.

## Before recording (about 10 minutes)

1. Reset the portal to layout A, and re-record `notices` on it so the repair has something to break:

   ```bash
   npm start
   ```

   ```bash
   curl -XPOST 'localhost:4400/__layout?set=a'
   ```

   ```bash
   npx tsx src/cli.ts create --force --name notices --url http://localhost:4400/ "Store the title of the most recent notice as 'title' and store its date as 'date'."
   ```

2. Install the plugin, if it isn't already, from Claude Code in this repo folder:

   ```
   /plugin install sidedoor --marketplace himxsh/Sidedoor
   ```

   Run from the repo folder, the plugin's server uses the repo's endpoints, the same ones the dashboard shows. If Claude Code also offers the project's own `.mcp.json` server, decline it so only one `sidedoor` server is loaded.

3. Make sure `author-born` doesn't exist yet (beat 2 records it fresh): `ls endpoints/`.

4. Lay out the screen: Claude Code on the left, and on the right the dashboard (http://localhost:3030/dashboard) and portal (http://localhost:4400) as two browser tabs. Have a spare terminal ready for `curl`.

5. Do a quick dry run of `/sidedoor list`. It's free, and it warms up `npx`.

Recordings and repairs take 1–3 minutes. Record them live and speed them up 4–8×, keeping the dashboard timeline visible so the speed-up reads as honest. Leave the on-screen timers (`durationMs`, the dashboard clock) visible.

---

## 0:00–0:15: The problem

**Screen:** the Campus Portal's fees page, then a view-source or network tab showing no API.

**Say:**
> "Half the data I need lives on sites with no API: a college portal, a supplier catalogue, an internal dashboard. Agents can browse them, but every visit is slow, costs money, and nobody checks whether the answer is right."

## 0:15–0:55: One sentence becomes a tool

**Screen:** Claude Code. Type:

```
/sidedoor go through https://quotes.toscrape.com/author/Albert-Einstein/ and get the author's birth date and birthplace
```

Claude shows the draft: name `author-born`, input `author` = `Albert-Einstein` (taken from the URL as `{{author}}`), the sentence "Store the birth date as 'born_date' and the birthplace as 'born_location'", and the one-time cost. Say "record it". Cut to the dashboard while Kane's steps stream into the timeline (speed this part up).

**Say:**
> "I type one sentence. Claude turns it into an endpoint: it spots the part that will change next time and makes it an input. Kane records the browser flow once. Sidedoor builds a contract from what came back (these field names, this type of value) and replays the recording once before it goes live."

**Screen:** Claude answers with Einstein's birth date and birthplace, then "`author_born(author)` is now a tool".

## 0:55–1:20: The second call is the point

**Screen:** Claude Code:

```
/sidedoor author-born Jane-Austen
```

It returns in about 20 s with `verified: true`. Cut to a terminal:

```bash
curl 'localhost:3030/api/author-born?author=Mark-Twain'
```

The JSON appears. Point at `verified`, `durationMs` and the dashboard's **credits spent vs saved** tile.

**Say:**
> "That was the expensive part, and it happens once. Now it's a typed tool for any agent and a plain JSON endpoint for anything else. Each call replays the recording, so it takes seconds, not minutes, costs one to three credits instead of twenty, and every value is checked against the contract before you see it."

*(Optional 5-second beat if there's time: `/sidedoor go through https://books.toscrape.com/ and get the price of "Sapiens"`. Claude says `book_price` already does this and calls it instead of recording again.)*

## 1:20–2:15: The site changes, and the tool fixes itself (the money shot)

**Screen:** terminal:

```bash
curl -XPOST 'localhost:4400/__layout?set=b'
```

Flip to the portal tab and reload: it's a new dashboard layout, and the notices are now behind an **Announcements** link.

**Screen:** Claude Code:

```
/sidedoor notices
```

Cut to the dashboard timeline (sped up) and narrate each event as it lands:

1. **REPLAY**: Kane reports *passed*…
2. **CONTRACT**: …but `title` is the string `"false"`. The contract rejects it: "boolean where text was expected".
3. **RE-RECORD**: Kane re-authors the flow against the new page. It fails, and Kane's remark says to open Announcements first.
4. **RETRY WITH KANE'S FIX**: Sidedoor feeds Kane's own suggestion back in. It passes the contract.
5. **VERIFY → SWAP**: one more replay proves it, and the new recording goes into service.

Claude answers with the correct newest notice and notes that the site changed and Sidedoor re-recorded the flow before answering (`repaired: true`).

**Say:**
> "The portal was redesigned. Kane's replay said 'passed', but it returned the word 'false' as the notice title. On its own, an agent would have believed that. The contract caught it, Kane re-recorded, Sidedoor took Kane's own fix, proved it with a second replay, and swapped it in. No human touched it, and the agent got the right answer."

## 2:15–2:40: Why not just Kane?

**Screen:** the README's "What Kane does (and what Sidedoor adds)" table, or a single slide with three lines:

- **Kane alone:** a full agent run every time; "passed" can still mean wrong data; a redesign breaks it silently.
- **Sidedoor:** one recording, then cheap replays; every value checked; repairs itself and proves the fix.
- **Plus:** queueing, caching, locks, form-submitting endpoints never retried, screenshots kept as evidence.

Optionally flash `evidence/build-hook/failed-*-dashboard.png`: Kane also guards this project's own UI through a Claude Code hook that blocked a bad edit.

**Say:**
> "Kane is the browser hands. Sidedoor is everything that makes those hands safe to call a thousand times: the contract, the cache, the queue, and the repair loop."

## 2:40–3:00: Try it

**Screen:** the landing page's **Run it in two minutes** section.

```
/plugin install sidedoor --marketplace himxsh/Sidedoor
```

**Say:**
> "One command in Claude Code, then `/sidedoor`, a URL and a task. No Kane account? The hosted dashboard plays back these exact runs at getsidedoor.pages.dev."

End card: `getsidedoor.pages.dev` · `github.com/himxsh/Sidedoor`

---

## After recording

- Upload as **unlisted**, open the link in a private window, then paste it into the README (*Video* line) and into the landing page's `[VIDEO LINK]` button (`web/index.html`).
- Reset for the next take:

  ```bash
  curl -XPOST 'localhost:4400/__layout?set=a'
  ```

  ```bash
  npx tsx src/cli.ts create --force --name notices --url http://localhost:4400/ "Store the title of the most recent notice as 'title' and store its date as 'date'."
  ```

  ```bash
  rm -rf endpoints/author-born
  ```

## If something goes wrong on camera

| Problem | What to do |
|---|---|
| The `author-born` recording fails | Show Kane's remark. That's the honest path. Then use the pre-recorded `quotes` endpoint for the replay beat (`/sidedoor quotes humor`). |
| The repair takes more than 4 minutes | Cut between events, and keep the dashboard timeline in the frame. The README's real run took 3 min 20 s. |
| The first call with a new input (`Jane-Austen`) repairs itself instead of replaying in 20 s | This is real: in testing, `book-price` recorded with one title broke the contract on the first other title (`availability: "false"`), and the guard re-recorded it in about 2.5 min. Either keep it as a bonus repair beat, or record off camera, call it once with a second input to harden it, then film the fast call with a third. |
| Claude reuses an endpoint you meant to record | Delete it first (step 3 of the prep), or give the new one a different site or field. |
| Kane isn't signed in | `kane-cli login` before recording, and confirm with `/sidedoor list` plus one cached call. |
