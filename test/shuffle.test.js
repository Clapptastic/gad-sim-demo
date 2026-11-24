import assert from "node:assert/strict";
import { test } from "node:test";
import { shuffle } from "../lib/shuffle.js";

test("keeps every item", () => {
  assert.deepEqual(shuffle([1, 2, 3, 4]).sort(), [1, 2, 3, 4]);
});
