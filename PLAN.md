# Sidedoor: project plan

Working name: **Sidedoor** (an API side door for websites that have no API). 

## 1. What we are building

One sentence turns any web page into a callable endpoint and an agent tool.

- A developer gives a URL, a plain-English sentence and named inputs.
- Kane records the flow once (paid).
- Every later call is a free replay that returns fresh data as JSON.
- When the site changes and the replay breaks, Kane re-records it and the result is checked against a saved contract before the endpoint goes back into service.

## 2. Facts this plan rests on

Measured with Kane CLI 0.10.4 against a public scraping sandbox.


| Fact                                                               | Status                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Recording a flow costs about 18 credits and takes about 50 seconds | Measured                                                                       |
| A replay returns fresh values from the live page                   | Measured (3 replays, 3 different quotes)                                       |
| A replay costs zero credits                                        | Measured (balance unchanged)                                                   |
| A replay takes 3–5 s in the browser, 15–19 s end to end            | Measured                                                                       |
| A replay accepts a new input through `--variables`                 | Measured, after removing the `variables:` block Kane writes into the test file |
| Returned values are in `run_end.context.variables.<name>.value`    | Measured                                                                       |
| Kane also writes a Playwright script for each saved flow           | Observed                                                                       |
| Kane re-records on its own when a replay stops matching            | **From docs only, not tested**                                                 |
| `--author` forces a re-record on demand                            | **From help text only, not tested**                                            |
| Each call uploads a run record to Test Manager                     | Observed; whether it can be switched off is unknown                            |




## 3. How it scores against the rubric


| Criterion   | What we show                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ships       | Deployed dashboard, a one-command local run, and working endpoints                                                                                      |
| Verified    | Kane proves every call's result against a contract, and catches the broken endpoint on camera. Kane also verifies the dashboard itself during the build |
| Closed loop | Agent calls a tool, Kane runs it, the failure returns to the agent, the agent calls repair, Kane re-records and re-verifies                             |
| Craft       | A developer can install it and give their agent a new tool in one minute                                                                                |




## 4. Parts of the system

One TypeScript package, Node 20 or newer.

### 4.1 Runner

Wraps `kane-cli` as a child process.

- Always passes `--agent --headless --timeout`.
- Reads the output line by line, ignores unknown events, and takes the result from the `run_end` line.
- Maps exit codes: 0 passed, 1 failed, 2 did not start, 3 timed out.
- Sets `KANE_CLI_USER_AGENT` on every call.



### 4.2 Endpoint store

One folder per endpoint, committed to git so recordings travel with the repo.

```
endpoints/<name>/
  endpoint.json        name, url, sentence, inputs, kind (read or action), contract, stats
  <name>_test.md       the Kane test file
  output-<name>/       the recording Kane replays
```



### 4.3 Create

`sidedoor create --name quotes --url <url> --input tag "store the first quote as 'quote' and its author as 'author'"`

1. Run `kane-cli run ... --name <name>` with sample input values.
2. Move the test file and recording into the endpoint folder.
3. Remove the `variables:` block from the test file (required, see section 2).
4. Build the contract from the returned values: field names, types, and "must not be empty". No AI model is needed for this.
5. Replay once immediately to prove the recording works, and store that result as the first sample.



### 4.4 Call

`sidedoor call quotes --tag humor` and `GET /api/quotes?tag=humor`

1. Replay with the inputs passed through `--variables`.
2. Validate the values against the contract.
3. Return JSON: the data, whether it was verified, the duration, and a link to the evidence.
4. Reads are cached for a configurable time. Actions are never cached.



### 4.5 Guard (the repair loop)

Triggered when a replay fails or the result breaks the contract.

1. Mark the endpoint as "repairing".
2. Re-record with `kane-cli testmd run --author`.
3. Validate the new result against the contract.
4. If it passes, keep the new recording and mark the endpoint healthy.
5. If it fails, return a structured failure to the caller with Kane's failure remark, and expose a `repair_endpoint` tool so the calling agent can supply a sharper sentence. Up to three attempts.
6. If still failing, mark the endpoint broken and keep the evidence link.

Every step is appended to an event log that the dashboard reads.

### 4.6 Server

- `GET` or `POST /api/<name>` to call an endpoint.
- `GET /api/endpoints` to list them with health.
- A live event stream for the dashboard.
- A queue so only one or two browsers run at a time.



### 4.7 Agent tools (MCP server)

- One tool per endpoint, with typed inputs taken from `endpoint.json`.
- `create_endpoint`, so an agent can make itself a new tool.
- `repair_endpoint`, so an agent can fix a broken one.

This keeps the product agent-agnostic: Claude Code, Cursor, Codex and others can all use it, and no AI key is needed inside Sidedoor itself.

### 4.8 Dashboard (the web app)

- List of endpoints with health, last result, speed and "credits saved" (calls made times the recording cost).
- A "create" form: URL, sentence, inputs.
- A "try it" box that calls an endpoint and shows the JSON.
- A repair timeline showing detect, re-record, check, swap, with Kane's screenshots.
- A hosted copy that plays back recorded runs, for judges who do not install anything.



### 4.9 Demo portal

A small "Campus Portal" site in the repo with no API:

- A notice board (read).
- A fee table that takes a student ID (read with an input).
- A leave-request form (action with inputs, returns a confirmation number).
- A layout switch that moves things around, to trigger the repair on camera.

All data in it is made up.

### 4.10 Kane in the build loop

A Claude Code hook that runs after every file edit:

1. Replays the Kane tests for the dashboard and the portal.
2. On failure, returns Kane's failure remark to the agent, which must fix the code before continuing.

Keep every failed run from the build. These are the "Kane caught this" evidence for the video and README.

## 5. Demo endpoints


| Name            | Site                    | Kind   | Inputs                 | Returns                      |
| --------------- | ----------------------- | ------ | ---------------------- | ---------------------------- |
| `quotes`        | Public scraping sandbox | Read   | tag                    | first quote, author          |
| `book-price`    | Public scraping sandbox | Read   | title                  | price, in stock              |
| `notices`       | Demo portal             | Read   | none                   | latest notice title and date |
| `fees`          | Demo portal             | Read   | student ID             | amount due, due date         |
| `leave-request` | Demo portal             | Action | name, from, to, reason | confirmation number          |


Only static, automation-friendly sites are used, so outputs stay correct.

## 6. Build phases

Work through the phases in order. Each phase is finished only when its "Done when" check passes.


| Phase | Work                                                                                                                                                    | Done when                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1     | Create the GitHub repo (fresh, so the first commit is after 12 November). Scaffold the package. Build the runner.                                       | A script replays the existing quote test and prints JSON         |
| 2     | **Repair gate test:** build the demo portal with the layout switch, record `notices`, flip the layout, check that re-recording returns the right value. | The repair works, or the fallback in section 8 is chosen         |
| 3     | Create and call commands, endpoint store, contract builder.                                                                                             | `quotes` and `notices` created and called from the command line  |
| 4     | Server with the call and list routes. Set up the build hook and record the first dashboard test.                                                        | `curl` returns verified JSON                                     |
| 5     | Guard loop and event log.                                                                                                                               | Flipping the portal layout repairs `notices` with no manual step |
| 6     | Agent tools server with per-endpoint tools, create and repair.                                                                                          | Claude Code calls `quotes` and creates a new endpoint itself     |
| 7     | Action endpoints and the `leave-request` flow. Remaining demo endpoints.                                                                                | All five endpoints pass                                          |
| 8     | Dashboard: list, try-it box, create form, repair timeline.                                                                                              | Full flow works in the browser                                   |
| 9     | Hosted dashboard with recorded runs. Deploy the portal. One-command start.                                                                              | A stranger can open the link and see it work in 30 seconds       |
| 10    | README: setup, what Kane does, the failed runs Kane caught, limits.                                                                                     | Fresh clone works from the README alone                          |
| 11    | Record the video (two takes). Upload as unlisted. Test the link in a private window.                                                                    | Video under 3:00                                                 |
| 12    | Submit the form.                                                                                                                                        | Confirmation received                                            |




## 7. Three-minute video


| Time      | What is on screen                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | The problem: an agent is asked for data from the campus portal and cannot get it, because there is no API                                                  |
| 0:20–1:00 | One sentence typed into Sidedoor; Kane records it; `curl` returns JSON; the cost counter shows one paid recording                                          |
| 1:00–1:30 | Claude Code calls the new tool, then submits a leave request through the action endpoint                                                                   |
| 1:30–2:20 | The portal layout is switched. The next call fails the contract. The timeline shows Kane re-recording and the check passing. The endpoint is healthy again |
| 2:20–2:45 | The build hook: an edit breaks the dashboard, Kane fails, the agent reads the failure and fixes it                                                         |
| 2:45–3:00 | Totals: endpoints, free calls, credits spent. Install command                                                                                              |


Lead with the repair if the first cut feels slow; judges stop watching at 3:00.

## 8. Risks and fallbacks


| Risk                                                      | Fallback                                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Re-recording does not find the data after a layout change | Make the sentence more specific (name the label next to the value) and retry; if still unreliable, limit the layout change to one Kane handles    |
| `--author` behaves differently from the help text         | Delete the recording folder and run the test again, which forces a fresh recording                                                                |
| The saved-input catch returns stale values                | The store always strips the `variables:` block, and a test asserts two inputs return two different results                                        |
| Calls are slow (15–19 s)                                  | Cache reads; show the timing openly in the dashboard                                                                                              |
| Judges cannot run it without their own Kane sign-in       | Hosted dashboard with recorded runs, plus the video                                                                                               |
| Actions with side effects fire twice                      | Actions are never cached or retried automatically                                                                                                 |
| Scope too large for the time left                         | Cut in this order: `book-price`, the create form in the dashboard, `repair_endpoint` as an agent tool. Never cut the guard loop or the build hook |




## 9. Submission checklist

- [x] Registered at the hackathon site and on Luma
- [x] TestMu AI account signed up and Kane CLI run (done)
- [ ] Public GitHub repo, first commit on or after 12 November
- [ ] README with setup steps
- [ ] Demo video, 3 minutes or less, unlisted, link tested in a private window
- [ ] One paragraph (section 1)
- [ ] Live URL and a one-command run
- [ ] Recorded runs as a fallback for anything that depends on a third-party site
- [ ] Submitted by 8:00 PM IST on 19 November