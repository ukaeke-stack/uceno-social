export interface CollectibleReward {
  code: string;
  displayName: string;
  category: string;
  rarity: string;
  quantity: number;
}

export type TeamCollectibleRewards = Map<string, CollectibleReward[]>;

/**
 * Grants a team's collectible rewards in the caller's existing transaction.
 * Catalog rows are locked once, finite supply is allocated deterministically,
 * and inventory rows are inserted in one statement. The catalog lock prevents
 * concurrent hunts from over-minting a shared collectible.
 */
export async function grantTreasureCollectiblesToUsers(
  tx: any, huntId: string, userIds: string[]
): Promise<TeamCollectibleRewards> {
  const rewardsByUser: TeamCollectibleRewards = new Map(
    [...new Set(userIds)].map(userId => [userId, []])
  );
  if (!rewardsByUser.size) return rewardsByUser;

  const rewards = await tx.unsafe(`SELECT catalog.id, catalog.code,
      catalog.display_name AS "displayName", catalog.category, catalog.rarity,
      catalog.max_supply AS "maxSupply", catalog.minted_count AS "mintedCount",
      reward.quantity
    FROM virtual_world_treasure_reward_items AS reward
    JOIN virtual_world_collectible_catalog AS catalog
      ON catalog.id = reward.collectible_id
    WHERE reward.hunt_id = $1::uuid AND catalog.enabled = TRUE
    ORDER BY catalog.id FOR UPDATE OF catalog`, [huntId]);
  if (!rewards.length) return rewardsByUser;

  const orderedUsers = [...rewardsByUser.keys()].sort();
  const collectibleIds = rewards.map((reward: any) => reward.id);
  const existing = await tx.unsafe(`SELECT user_id AS "userId", collectible_id AS "collectibleId"
    FROM virtual_world_user_collectibles
    WHERE source_treasure_hunt_id = $1::uuid
      AND user_id = ANY($2::uuid[]) AND collectible_id = ANY($3::uuid[])`,
    [huntId, orderedUsers, collectibleIds]);
  const existingKeys = new Set(existing.map((row: any) => row.userId + ":" + row.collectibleId));

  const insertUsers: string[] = [];
  const insertCollectibles: string[] = [];
  const insertQuantities: number[] = [];
  const rewardById = new Map<string, any>();
  const mintById = new Map<string, number>();

  for (const reward of rewards) {
    const quantity = Number(reward.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) continue;
    const maxSupply = reward.maxSupply === null ? null : BigInt(String(reward.maxSupply));
    let remaining = maxSupply === null
      ? null
      : maxSupply - BigInt(String(reward.mintedCount));
    for (const userId of orderedUsers) {
      if (existingKeys.has(userId + ":" + reward.id)) continue;
      if (remaining !== null && remaining < BigInt(quantity)) continue;
      insertUsers.push(userId);
      insertCollectibles.push(reward.id);
      insertQuantities.push(quantity);
      mintById.set(reward.id, (mintById.get(reward.id) ?? 0) + quantity);
      rewardById.set(reward.id, reward);
      if (remaining !== null) remaining -= BigInt(quantity);
    }
  }

  if (!insertUsers.length) return rewardsByUser;
  const inserted = await tx.unsafe(`INSERT INTO virtual_world_user_collectibles
      (user_id, collectible_id, source_treasure_hunt_id, quantity)
    SELECT input.user_id, input.collectible_id, $1::uuid, input.quantity
    FROM unnest($2::uuid[], $3::uuid[], $4::integer[])
      AS input(user_id, collectible_id, quantity)
    ON CONFLICT (user_id, collectible_id, source_treasure_hunt_id) DO NOTHING
    RETURNING user_id AS "userId", collectible_id AS "collectibleId", quantity`,
    [huntId, insertUsers, insertCollectibles, insertQuantities]);

  const actualMintById = new Map<string, number>();
  for (const row of inserted) {
    actualMintById.set(row.collectibleId,
      (actualMintById.get(row.collectibleId) ?? 0) + Number(row.quantity));
    const reward = rewardById.get(row.collectibleId);
    rewardsByUser.get(row.userId)?.push({
      code: reward.code, displayName: reward.displayName,
      category: reward.category, rarity: reward.rarity, quantity: Number(row.quantity)
    });
  }

  if (actualMintById.size) {
    const ids = [...actualMintById.keys()];
    const quantities = ids.map(id => actualMintById.get(id)!);
    await tx.unsafe(`UPDATE virtual_world_collectible_catalog AS catalog
      SET minted_count = catalog.minted_count + input.quantity
      FROM unnest($1::uuid[], $2::integer[]) AS input(id, quantity)
      WHERE catalog.id = input.id`, [ids, quantities]);
  }
  return rewardsByUser;
}

/**
 * Single-player grant path retained for existing callers and focused
 * idempotency tests. Team completion uses the batched function above.
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
