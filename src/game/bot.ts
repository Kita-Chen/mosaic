import { GameState, GameTile, GameTileType, Player } from "./types";

export interface BotMove {
  tiles: GameTile[];
  tileGroupId: number | "middle";
  targetSlotId: number | "minus-points";
}

const INDEX_TO_MINUS_POINTS = [1, 1, 2, 2, 2, 3, 3];

/** 模擬將某花色放上花磚牆指定列後的即時連線得分 */
function estimateWallScore(
  player: Player,
  rowIndex: number,
  tileType: GameTileType
): number {
  const row = player.rightSlots[rowIndex];
  const targetSlot = row.find((slot) => slot.type === tileType);
  if (!targetSlot) return 1;

  let points = 1;
  let hasRowPoints = false;
  let hasColPoints = false;

  // 水平相鄰
  for (let c = targetSlot.colIndex + 1; c < row.length && row[c]?.tile; c++) {
    hasRowPoints = true;
    points++;
  }
  for (let c = targetSlot.colIndex - 1; c >= 0 && row[c]?.tile; c--) {
    hasRowPoints = true;
    points++;
  }

  // 垂直相鄰
  for (
    let r = rowIndex + 1;
    r < player.rightSlots.length && player.rightSlots[r][targetSlot.colIndex]?.tile;
    r++
  ) {
    hasColPoints = true;
    points++;
  }
  for (
    let r = rowIndex - 1;
    r >= 0 && player.rightSlots[r][targetSlot.colIndex]?.tile;
    r--
  ) {
    hasColPoints = true;
    points++;
  }

  if (hasRowPoints && hasColPoints) points++;
  return points;
}

/** 計算新增 extraPenaltyTiles 顆地板扣分磚的實際扣分增量 */
function calculatePenaltyDelta(
  currentMinusCount: number,
  extraPenaltyTiles: number
): number {
  let penalty = 0;
  for (let i = 0; i < extraPenaltyTiles; i++) {
    penalty += INDEX_TO_MINUS_POINTS[currentMinusCount + i] || 0;
  }
  return penalty;
}

/** 根據目前盤面與玩家 ID，選出啟發式評分最高的合法動作 */
export function chooseBestMove(
  G: GameState,
  playerID: string
): BotMove | null {
  const player = G.players[playerID];
  if (!player) return null;

  // 1. 收集所有可拿取的來源（工廠圓盤 + 中央區）
  const sources: { id: number | "middle"; tiles: GameTile[] }[] = [];
  G.tileGroups.forEach((group, idx) => {
    if (group.length > 0) {
      sources.push({ id: idx, tiles: group });
    }
  });
  if (G.tileMiddleGroup.length > 0) {
    sources.push({ id: "middle", tiles: G.tileMiddleGroup });
  }

  let bestMove: BotMove | null = null;
  let bestScore = -Infinity;

  // 2. 枚舉所有 (來源, 花色, 目標列) 合法組合並評分
  for (const source of sources) {
    const typesInSource = Array.from(
      new Set(
        source.tiles
          .map((t) => t.type)
          .filter((t) => t !== GameTileType.BEGIN)
      )
    );

    const getsBeginTile = source.id === "middle" && G.beginTileOwner === null;

    for (const tileType of typesInSource) {
      const matchingTiles = source.tiles.filter((t) => t.type === tileType);
      const count = matchingTiles.length;

      // 評估放入 0~4 號圖案線
      for (let rowIndex = 0; rowIndex < player.leftSlots.length; rowIndex++) {
        const slotRow = player.leftSlots[rowIndex];
        const emptyCount = slotRow.filter((s) => s === null).length;

        // 已滿的列略過（由 minus-points 統一評估）
        if (emptyCount === 0) continue;

        // 已有不同顏色則不合法
        if (slotRow[0] && slotRow[0].type !== tileType) continue;

        // 花磚牆該列已有此顏色則不合法
        const rightSlot = player.rightSlots[rowIndex].find(
          (s) => s.type === tileType
        );
        if (rightSlot?.tile) continue;

        const placedCount = Math.min(count, emptyCount);
        const overflowCount = Math.max(0, count - emptyCount);
        const extraMinus = overflowCount + (getsBeginTile ? 1 : 0);
        const penalty = calculatePenaltyDelta(
          player.minusPoints.length,
          extraMinus
        );

        let score = placedCount * 3.0 - penalty * 4.5;

        // 剛好填滿該列：給予高額獎勵 + 預測上牆連線分數
        if (placedCount === emptyCount) {
          const wallPoints = estimateWallScore(player, rowIndex, tileType);
          score += 8.0 + wallPoints * 2.5 + rowIndex * 0.5;
        } else {
          // 避免拿 1 顆小磚就隨便卡住空的第 4、5 列
          const isRowEmpty = emptyCount === slotRow.length;
          if (isRowEmpty && rowIndex >= 3 && placedCount === 1) {
            score -= 3.0;
          }
          // 已經快填滿（只差 1 格）給予小額加分
          if (emptyCount - placedCount === 1) {
            score += 2.0;
          }
        }

        // 搶先手標記的策略補償
        if (getsBeginTile) {
          score += 1.5;
        }

        // 微幅隨機擾動，讓同分選擇更自然
        score += Math.random() * 0.4;

        if (score > bestScore) {
          bestScore = score;
          bestMove = {
            tiles: matchingTiles,
            tileGroupId: source.id,
            targetSlotId: rowIndex,
          };
        }
      }

      // 評估直接丟入地板線（保底合法步數，確保絕對不會卡死）
      const extraMinus = count + (getsBeginTile ? 1 : 0);
      const penalty = calculatePenaltyDelta(
        player.minusPoints.length,
        extraMinus
      );
      const floorScore = -penalty * 5.0 - 5.0 + Math.random() * 0.2;

      if (floorScore > bestScore) {
        bestScore = floorScore;
        bestMove = {
          tiles: matchingTiles,
          tileGroupId: source.id,
          targetSlotId: "minus-points",
        };
      }
    }
  }

  return bestMove;
}
