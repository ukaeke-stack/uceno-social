export interface CollectibleReward {
  code: string;
  displayName: string;
  category: string;
  rarity: string;
  quantity: number;
}

/**
 * Grants authored collectible rewards in the caller's existing transaction.
 * Catalog rows are locked so finite supplies cannot be over-minted under
 * concurrent claims. Inventory uniqueness makes retries idempotent.
 */
export async function grantTreasureCollectibles(
  tx: any, huntId: string, userId: string
): Promise<CollectibleReward[]> {
  const rewards = await tx.unsafe(`SELECT catalog.id, catalog.code,
      catalog.display_name AS "displayName", catalog.category, catalog.rarity,
      catalog.max_supply AS "maxSupply", catalog.minted_count AS "mintedCount",
      reward.quantity
    FROM virtual_world_treasure_reward_items AS reward
    JOIN virtual_world_collectible_catalog AS catalog
      ON catalog.id = reward.collectible_id
    WHERE reward.hunt_id = $1::uuid AND catalog.enabled = TRUE
    ORDER BY catalog.id FOR UPDATE OF catalog`, [huntId]);
  const granted: CollectibleReward[] = [];
  for (const reward of rewards) {
    const existing = await tx.unsafe(`SELECT id FROM virtual_world_user_collectibles
      WHERE user_id = $1::uuid AND collectible_id = $2::uuid
        AND source_treasure_hunt_id = $3::uuid LIMIT 1`,
      [userId, reward.id, huntId]);
    if (existing.length) continue;
    const quantity = Number(reward.quantity);
    const minted = BigInt(String(reward.mintedCount));
    const maxSupply = reward.maxSupply === null ? null : BigInt(String(reward.maxSupply));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) continue;
    if (maxSupply !== null && minted + BigInt(quantity) > maxSupply) continue;
    const inserted = await tx.unsafe(`INSERT INTO virtual_world_user_collectibles
      (user_id, collectible_id, source_treasure_hunt_id, quantity)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
      ON CONFLICT (user_id, collectible_id, source_treasure_hunt_id) DO NOTHING
      RETURNING id`, [userId, reward.id, huntId, quantity]);
    if (!inserted.length) continue;
    await tx.unsafe(`UPDATE virtual_world_collectible_catalog
      SET minted_count = minted_count + $2 WHERE id = $1::uuid`, [reward.id, quantity]);
    granted.push({ code: reward.code, displayName: reward.displayName,
      category: reward.category, rarity: reward.rarity, quantity });
  }
  return granted;
}
