---
name: sidedoor
description: Turn a web page with no API into a reusable, verified agent tool from one plain-English task, using the Sidedoor MCP server (Kane CLI records the browser flow once; later calls are contract-checked replays that repair themselves). Use when the user runs /sidedoor, or asks to get data from a site, automate a page, or "make an API/tool" for a website.
argument-hint: <url> <task>  |  <endpoint> [inputs]  |  fix <endpoint>  |  list
---

# Sidedoor

The user said: `$ARGUMENTS`

You drive the `sidedoor` MCP server's tools: `list_endpoints`, `create_endpoint`, `repair_endpoint`, and one tool per endpoint already made (named after the endpoint, with `-` changed to `_`). Kane CLI does the browsing. Your job is to turn the user's words into a good endpoint, and to reuse an endpoint instead of recording a new one whenever you can.

## 1. Work out what they want

- **Empty, or `list`**: call `list_endpoints`. Show each tool's name, health, inputs and fields, then give one usage line: `/sidedoor <url> <task>`.
- **`fix <endpoint>` (or "repair")**: go to step 5.
- **The name of an existing endpoint, with or without values** (`/sidedoor book-price "Sapiens"`): call that endpoint's tool with those inputs. Show the result (step 4).
- **A URL and a task**: first call `list_endpoints`. If an endpoint already reads the same site and returns the same fields, **call it instead of recording again**, and say so ("`book_price` already does this; replaying it costs about 1–3 credits, not 10–30"). Otherwise, go to step 2.

## 2. Draft the endpoint

Turn the task into `create_endpoint` arguments:

- **name**: short and kebab-case, describing the result (`book-price`, `top-story`, `fee-status`).
- **inputs**: anything in the task the user could plausibly change next time (a search term, an ID, a title, a tag). Each one gets a `{{name}}` placeholder and a `sample` taken from the user's own words. If nothing varies, leave inputs empty.
- **url**: the start page. Put the input in the URL when the site encodes it there (`https://quotes.toscrape.com/tag/{{tag}}/`). Otherwise, use the plain page and put the input in the sentence.
- **sentence**: one direct instruction, saying which steps to take and which values to store. Every value returned must appear as `store ... as 'field'`, with fields in snake_case.
  - Name the visible labels and links, e.g. "Click the book whose title is {{title}}, then store its price as 'price' and its availability text as 'availability'."
  - No conditionals ("if", "when", "unless"). They record fine but don't replay reliably. Pick one direct path.
  - Return values, not judgements. Instead of "tell me if it's cheap", store the price and judge it yourself afterwards.
- **kind**: `action` if the flow submits, books, sends, buys, posts, deletes or changes anything. Otherwise `read`.

## 3. Confirm, then record

Before calling `create_endpoint`, show the draft in a few lines: name, URL, sentence, inputs with their samples, and the fields to be returned. Say what it will cost: **about 1–2 minutes and roughly 10–30 Kane credits, paid once**. After that, each call is a replay of about 15–40 s and 1–3 credits.

- **read**: if the user's request was clear, you may record straight away after showing the draft.
- **action**: always stop and ask first. Recording runs the flow for real, so the form *will* be submitted once with the sample values. Never create an action endpoint without an explicit yes.

Then call `create_endpoint`. It records with Kane, builds a contract (field names and types) from the stored values, and proves one replay before the endpoint goes live.

## 4. Report

On success, lead with the answer to the user's actual question (from `sample`). Then add one short block:

- the new tool, e.g. `book_price(title)` → `price`, `availability`;
- recording credits spent (`recordingCredits`);
- what it means from now on: "Next time, call `/sidedoor book-price <title>` (or I can call `book_price` directly). It's a replay, checked against the contract, and Sidedoor re-records it on its own if the site changes."

If a tool call comes back with `verified: true`, say the result was checked. If `repaired: true`, say the replay broke the contract and Sidedoor re-recorded and verified the flow before answering. Quote the reason the result or its events give (for example "availability: boolean where text was expected"), and don't guess at a cause such as "the site changed". This often happens the first time an endpoint is called with an input other than its recording sample. If `cached: true`, say it came from the 5-minute cache.

Don't call the new tool again just to show it off. That spends the user's credits. Offer it instead.

## 5. When something fails

- **`kane-cli` not found / not signed in**: tell the user to run `npm install -g @testmuai/kane-cli`, then `kane-cli login`, and try again. Don't try to work around it.
- **`already exists` (409)**: the endpoint exists. Call it, or pick a different name if the task really is different.
- **Recording failed**: show Kane's remark verbatim. Usually it names what was missing (a link to open first, a label that isn't there). Rewrite the sentence using that, show it, and offer to record once more. Don't loop more than twice without asking.
- **A call came back unhealthy or with a contract violation**, or the user asked to fix one: call `repair_endpoint` with the endpoint name. If Kane's remark points at a layout change, pass a sharper `sentence` naming the page or link to open first. It must still store the same fields. **Never auto-repair an action endpoint**: a re-record submits the form again. Ask first.

## Limits worth saying when relevant

- It only works on public, automation-friendly pages. No logins, CAPTCHAs or bot walls.
- The contract checks shape, not meaning. A date in a new format still passes as text.
- Endpoints are saved in `~/.sidedoor/` (or `SIDEDOOR_HOME`), so they survive across sessions and are also served over HTTP by `npx getsidedoor serve`.
