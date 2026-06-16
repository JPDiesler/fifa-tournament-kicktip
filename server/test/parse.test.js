import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson } from "../services/ai/parse.js";

test("extractJson: plain object", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
});
test("extractJson: strips ```json fences", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
});
test("extractJson: ignores chatter around the object", () => {
  assert.deepEqual(extractJson('Sure!\n{"tip":{"home":2,"away":1}}\nDone.'), { tip: { home: 2, away: 1 } });
});
test("extractJson: first { to last }", () => {
  assert.deepEqual(extractJson('prefix {"x":{"y":1}} suffix'), { x: { y: 1 } });
});
test("extractJson: throws on no JSON", () => {
  assert.throws(() => extractJson("no json here"));
});
test("extractJson: throws on empty", () => {
  assert.throws(() => extractJson(""));
});
