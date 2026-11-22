import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const route = readFileSync(resolve(root, "app/api/worlds/[worldId]/wardrobe/route.ts"), "utf8");
const client = readFileSync(resolve(root, "unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarWardrobeSyncClient.cs"), "utf8");

test("wardrobe unequip JSON null is preserved as SQL NULL for the delete branch", () => {
  assert.match(client, /if \(item\.Value == null\) json\.Append\("null"\)/);
  assert.match(route, /FROM jsonb_each\(/);
  assert.match(route, /CASE WHEN value = 'null'::jsonb THEN NULL ELSE value #>> '\{\}' END AS item_id/);
  assert.doesNotMatch(route, /jsonb_each_text\(/);
  assert.match(route, /r\.item_id IS NULL AND NOT EXISTS \(SELECT 1 FROM invalid\)/);
});

test("wardrobe writes remain restricted to enabled items owned in the requested slot", () => {
  assert.match(route, /i\.user_id = \$\{session\.id\}::uuid/);
  assert.match(route, /i\.item_id = r\.item_id AND c\.slot = r\.slot AND c\.enabled = TRUE/);
  assert.match(route, /if \(result\[0\]\?\.invalidCount > 0\)/);
});
