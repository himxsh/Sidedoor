import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContract, storedNames, validate } from "../src/contract.js";
import { stripVariablesBlock } from "../src/runner.js";
import { setObjective } from "../src/engine.js";

test("storedNames reads the fields a sentence asks for", () => {
  assert.deepEqual(storedNames("Store the first quote as 'quote' and its author as \"author\"."), ["quote", "author"]);
});

test("Kane's silent wrong results fail the contract (docs/repair-gate.md #8, #11)", () => {
  const c = buildContract(["title", "date"], { title: "Exams", date: "2026-11-17" });
  assert.equal(validate(c, { title: "Exams", date: "17 November 2026" }).length, 0);
  assert.equal(validate(c, { title: "None", date: "None" }).length, 2);
  assert.equal(validate(c, { title: "false", date: "false" }).length, 2);
  assert.equal(validate(c, { title: "" }).length, 2);
});

test("numbers stay numbers", () => {
  const c = buildContract(["n"], { n: "42" });
  assert.equal(validate(c, { n: "abc" })[0].problem, "not a number");
});

test("variables block is stripped from the frontmatter", () => {
  const md = "---\nmode: testing\nvariables:\n  global.student_id:\n    value: S1001\n    secret: false\n---\n\n## Step 1\nGo.\n";
  assert.equal(stripVariablesBlock(md), "---\nmode: testing\n---\n\n## Step 1\nGo.\n");
});

test("setObjective rewrites step 1", () => {
  assert.equal(setObjective("---\n---\n\n## Step 1\nold sentence\n", "new one"), "---\n---\n\n## Step 1\nnew one\n");
});

test("kaneFix keeps the actionable part of a Kane remark", async () => {
  const { kaneFix } = await import("../src/engine.js");
  const remark = "The dashboard only provides a link to announcements, not the notice title and date themselves. The agent treated the missing details on this landing page as a final condition instead of following the visible Announcements link.\nOpen Announcements, identify the newest notice, then save its title and date. Do not assert that the dashboard must contain those details when it offers an announcements link.";
  assert.equal(kaneFix(remark), "Open Announcements, identify the newest notice, then save its title and date.");
  assert.equal(kaneFix("single line"), undefined);
});
