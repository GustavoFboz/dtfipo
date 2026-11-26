import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

const source = readFileSync(new URL("../src/components/NewCaseDialog.tsx", import.meta.url), "utf8");

test("never pass auth profile UUID into cadista_id; directory row ID is authoritative", () => {
  assert.doesNotMatch(source, /setCadistaId\(profile\.id\)/,
    "cadista_id references cadistas.id, NOT auth.users.id");
  assert.match(source, /cadistas\.data\s*\?\?\s*\[\]\)\.find\(\(c\)\s*=>\s*c\.user_id\s*===\s*profile\.id\)/,
    "responsible cadista must be resolved from authorized directory rows");
  assert.match(source, /if\s*\(mine\)\s*setCadistaId\(mine\.id\)/,
    "only an actual cadistas row ID can be suggested");
});
