// Contract builder and validator (PLAN.md §4.3 step 4). No AI model involved:
// the contract is derived from the field names in the sentence and the sample values.

export type FieldType = "string" | "number" | "boolean";

export interface FieldContract {
  type: FieldType;
  required: true;
}

export interface Contract {
  fields: Record<string, FieldContract>;
}

export interface Violation {
  field: string;
  problem: string;
  value?: unknown;
}

// Kane can report "passed" while storing these strings (docs/repair-gate.md #8, #11, #14).
const EMPTY_MARKERS = new Set(["", "none", "null", "undefined", "nan", "n/a"]);

/** Field names the sentence asks Kane to store: `... as 'quote'`, `as "author"`. */
export function storedNames(sentence: string): string[] {
  const names: string[] = [];
  const re = /\bas\s+['"`‘’“”]([A-Za-z_][A-Za-z0-9_]*)['"`‘’“”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence))) if (!names.includes(m[1])) names.push(m[1]);
  return names;
}

export function inferType(v: unknown): FieldType {
  const s = String(v ?? "").trim();
  if (/^(true|false)$/i.test(s)) return "boolean";
  if (/^-?\d+(\.\d+)?$/.test(s)) return "number";
  return "string";
}

export function buildContract(fields: string[], sample: Record<string, unknown>): Contract {
  const out: Contract = { fields: {} };
  for (const f of fields) out.fields[f] = { type: inferType(sample[f]), required: true };
  return out;
}

export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return EMPTY_MARKERS.has(String(v).trim().toLowerCase());
}

export function validate(contract: Contract, values: Record<string, unknown>): Violation[] {
  const violations: Violation[] = [];
  for (const [field, spec] of Object.entries(contract.fields)) {
    const v = values[field];
    if (!(field in values)) {
      violations.push({ field, problem: "missing" });
      continue;
    }
    if (isEmptyValue(v)) {
      violations.push({ field, problem: "empty", value: v });
      continue;
    }
    const s = String(v).trim();
    if (spec.type === "number" && !/^-?\d+(\.\d+)?$/.test(s)) violations.push({ field, problem: "not a number", value: v });
    if (spec.type === "boolean" && !/^(true|false)$/i.test(s)) violations.push({ field, problem: "not a boolean", value: v });
    // A text field that suddenly holds a bare true/false is Kane answering a yes/no check, not data.
    if (spec.type === "string" && /^(true|false)$/i.test(s)) violations.push({ field, problem: "boolean where text was expected", value: v });
  }
  return violations;
}

/** Keep only the contract fields, in contract order. */
export function pickFields(contract: Contract, values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of Object.keys(contract.fields)) if (f in values) out[f] = values[f];
  return out;
}
