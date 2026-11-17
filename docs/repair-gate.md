# Phase 2: repair gate test (18 Nov 2026, kane-cli 0.10.4)

Raw NDJSON for every run is in `evidence/p2-*.ndjson`.

| # | Endpoint | Layout | Run | Result | Credits |
|---|----------|--------|-----|--------|---------|
| 1 | notices | A | record | passed: "Mid-semester exam schedule released", 2026-11-17 | 15.6 |
| 2 | notices | A | replay | passed, same values | ~1 |
| 3 | notices | B (restyle only) | replay, `--no-adaptive-heal` | **passed**, right title, date now "17 November 2026" | ~1 |
| 4 | fees | A | record with `{{student_id}}`=S1001 | passed: ₹42,500, 2026-11-30 | 18.0 |
| 5 | fees | A | replay S1002 | passed: ₹18,000, 2026-12-05 | ~1 |
| 6 | fees | B | replay S1004, `--no-adaptive-heal` | **failed**, exit 1, `action_failed: fill @ step 3` | ~3 |
| 7 | fees | B | replay S1004, default adaptive heal | passed: ₹27,750, 12 December 2026 (heal triggered, 119 s) | 16.6 |
| 8 | fees | B | replay healed recording, S1001 | **"passed" but values are the string `"None"`** | ~0 |
| 9 | fees | B | original recording + `--author`, S1002 | passed: ₹18,000, 5 December 2026 | 17.0 |
| 10 | fees | B | replay after `--author`, S1003 and S1004 | both passed with correct values | ~1 each |
| 11 | notices | B2 (notices moved to /announcements) | replay | **"passed" but values are the string `"false"`** | ~1 |
| 12 | notices | B2 | `--author`, original sentence | failed; Kane's remark: open Announcements first | 9.7 |
| 13 | notices | B2 | `--author`, conditional sentence ("if not listed, open Announcements") | passed, right values | 28.7 |
| 14 | notices | B2 | replay of #13 | **"passed" but `"false"`**: conditional sentences do not replay reliably | ~1 |
| 15 | notices | B2 | `--author`, direct sentence ("click the Announcements link") | passed, right values | 18.2 |
| 16 | notices | B2 | two replays of #15 | both passed, right values | ~1 each |

## Answers

- **Does re-recording after a layout change return the right value?** Yes. `fees` was re-recorded with the
  original sentence (#9). `notices` needed a sharper sentence after its content moved to another page (#12 → #15).
  That is the first fallback in PLAN.md §8, and it is what `repair_endpoint` is for.
- **Does `--author` behave as the help text says?** Yes. It re-authors every step on the existing test, keeps
  no `variables:` block, and the new recording replays with fresh inputs (#10, #16). The §8 fallback
  (delete the recording folder) is not needed.
- **Adaptive heal** (on by default) fixed the run it healed (#7), but the recording it saved then returned
  `"None"` (#8).

## Consequences for the design

1. **Kane can report "passed" with wrong data** (#8, #11, #14). A replay's exit code is not enough. The
   contract treats `""`, `"None"`, `"null"`, `"undefined"` and `"false"` as empty, unless the sample
   value itself was a boolean.
2. Guard replays run with `--no-adaptive-heal`. The repair uses `--author`, and then one more **verification
   replay** before the endpoint goes back into service (#13 vs #14).
3. Kane's failure remark is a usable repair hint (#12). It goes back to the calling agent, which supplies a
   sharper sentence to `repair_endpoint`.
4. Replays are *almost* free: the balance drops about 1–3 credits per replay, probably from the analyze steps.
   Recording or re-authoring costs about 10–29 credits and takes 60–120 s.
5. A pure read on one page survives a cosmetic restyle (#3), because extraction is semantic at replay time.
   Interactions (fill, click) are what break (#6).
