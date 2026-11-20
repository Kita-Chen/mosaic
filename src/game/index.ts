import { times, dropRight, partition, each, shuffle } from "lodash";
import { INVALID_MOVE } from "boardgame.io/core";
import { GAME_ID } from "../config";
import { Game, PlayerID } from "boardgame.io";
import { GameState, GameTile, GameTileType, Player, ScoreBoard } from "./types";

export * from "./types";

const TILE_TYPE_COUNT = 20;
const DEFAULT_TILE_ORDER = [
  GameTileType.A,
  GameTileType.B,
  GameTileType.C,
  GameTileType.D,
  GameTileType.E,
];
const INDEX_TO_MINUS_POINTS = [1, 1, 2, 2, 2, 3, 3];
const PLAYERS_COUNT_TO_GROUPS = {
  2: 5,
  3: 7,
  4: 9,
};

function shiftBy<T>(offset: number, list: Array<T>): Array<T> {
  return offset < 1
    ? list
    : list.slice(-offset).concat(dropRight(list, offset));
}

function shouldReinitialize(state: GameState) {
  return (
    state.tileGroups.flat().length <= 0 && state.tileMiddleGroup.length <= 0
  );
}

function getTileGroups(
  tiles: GameTile[],
  usedTiles: GameTile[],
  groupCount: 5 | 7 | 9
) {
  const tileGroups = times<GameTile[]>(groupCount, () => []);
  const idsToRemove: string[] = [];
  let updatedTiles = [...tiles];
  let clearUsedTiles = false;

  for (let i = 0; i < groupCount * 4; i++) {
    let tile = updatedTiles[i];

    if (!tile && usedTiles.length > 0) {
      updatedTiles.push(...shuffle(usedTiles));
      clearUsedTiles = true;
      tile = updatedTiles[i];
    }

    if (tile) {
      idsToRemove.push(tile.id);
      tileGroups[i % groupCount].push(tile);
    }
  }

  updatedTiles = updatedTiles.filter((t) => !idsToRemove.includes(t.id));

  return {
    tileGroups,
    updatedUsedTiles: clearUsedTiles ? [] : usedTiles,
    updatedTilesInPool: updatedTiles,
  };
}

export const MosaicGame: Game<GameState> = {
  name: GAME_ID,

  setup: ({ ctx, random }) => {
    const tiles: GameTile[] = random.Shuffle(
      DEFAULT_TILE_ORDER.flatMap((tileType, groupIndex) => {
        return times<GameTile>(TILE_TYPE_COUNT, (index: number) => {
          return {
            type: tileType,
            id: String(groupIndex * TILE_TYPE_COUNT + index),
          };
        });
      })
    );

    const usedTiles: GameTile[] = [];

    const { updatedTilesInPool, updatedUsedTiles, tileGroups } = getTileGroups(
      tiles,
      usedTiles,
      PLAYERS_COUNT_TO_GROUPS[ctx.numPlayers]
    );

    const scoreboard: ScoreBoard = {};
    const players: { [key: string]: Player } = {};

    times(ctx.numPlayers, (index) => {
      const id = index.toString();
      const initialPlayer: Player = {
        id,
        leftSlots: [
          [null],
          [null, null],
          [null, null, null],
          [null, null, null, null],
          [null, null, null, null, null],
        ],
        rightSlots: times(5, (rowIndex) => {
          return shiftBy(rowIndex, DEFAULT_TILE_ORDER).map(
            (tileType, colIndex) => ({
              type: tileType,
              filled: false,
              colIndex,
              rowIndex,
            })
          );
        }),
        minusPoints: [],
      };

      players[id] = initialPlayer;
      scoreboard[id] = 0;
    });

    const initialState: GameState = {
      tilesInPool: updatedTilesInPool,
      usedTiles: updatedUsedTiles,
      tileGroups,
      beginTileOwner: null,
      scoreboard,
      tileMiddleGroup: [],
      players,
      shouldEndGame: false,
      hasPickedTiles: false,
      endGameVotes: [],
    };

    return initialState;
  },

  endIf: ({ G }) => {
    if (G.shouldEndGame) {
      let winner = { score: -Infinity, id: "" };

      each(G.scoreboard, (score, playerId) => {
        if (score > winner.score) {
          winner.score = score;
          winner.id = playerId;
        }
      });

      return {
        winner,
      };
    }
    return undefined;
  },

  moves: {
    voteEndGame: {
      undoable: false,
      client: false,
      move: ({ G, ctx, playerID }: any, humanPlayerIds: PlayerID[] = []) => {
        const voterId = String(playerID ?? ctx.currentPlayer);
        if (!G.players[voterId]) return INVALID_MOVE;

        if (!Array.isArray(G.endGameVotes)) {
          G.endGameVotes = [];
        }

        const existingIndex = G.endGameVotes.indexOf(voterId);
        if (existingIndex >= 0) {
          G.endGameVotes.splice(existingIndex, 1);
        } else {
          G.endGameVotes.push(voterId);
        }

        const validHumans = Array.from(
          new Set((humanPlayerIds || []).map(String))
        ).filter((id) => !!G.players[id]);

        if (
          validHumans.length > 0 &&
          validHumans.every((id) => G.endGameVotes.includes(id))
        ) {
          G.shouldEndGame = true;
        }
      },
    },

    endTurn: {
      undoable: false,
      client: false,
      move: ({ G, ctx, events }) => {
        if (!G.hasPickedTiles) return INVALID_MOVE;

        let overrideNextUser: PlayerID | null = null;

        if (shouldReinitialize(G)) {
          let shouldEndGame = false;
          each(G.players, (player) => {
            let points = 0;

            player.leftSlots.forEach((slotRow, rowIndex) => {
              if (slotRow.includes(null)) return;
              const filledRowTiles = slotRow as GameTile[];

              const [firstTile, ...restTiles] = filledRowTiles;
              const targetSlot = player.rightSlots[rowIndex].find(
                (slot) => slot.type === firstTile.type
              );

              if (!targetSlot) {
                throw new Error("Unexpected behaviour: missing right tile");
              }

              G.usedTiles.push(...restTiles);
              targetSlot.tile = firstTile;

              points++;

              let colRightIndex = targetSlot.colIndex + 1;
              let colLeftIndex = targetSlot.colIndex - 1;
              const row = player.rightSlots[targetSlot.rowIndex];
              let hasRowPoints = false;

              while (row[colRightIndex]?.tile) {
                hasRowPoints = true;
                colRightIndex++;
                points++;
              }

              while (row[colLeftIndex]?.tile) {
                hasRowPoints = true;
                colLeftIndex--;
                points++;
              }

              const columnAsList = player.rightSlots.map((row) => {
                return row.find(
                  (slot) => slot.colIndex === targetSlot.colIndex
                )!;
              });
              let rowRightIndex = targetSlot.rowIndex + 1;
              let rowLeftIndex = targetSlot.rowIndex - 1;
              let hasColumnPoints = false;

              while (columnAsList[rowRightIndex]?.tile) {
                hasColumnPoints = true;
                rowRightIndex++;
                points++;
              }

              while (columnAsList[rowLeftIndex]?.tile) {
                hasColumnPoints = true;
                rowLeftIndex--;
                points++;
              }

              if (hasRowPoints && hasColumnPoints) points++;

              slotRow.length = rowIndex + 1;
              slotRow.fill(null);
            });

            let minusPoints = 0;
            player.minusPoints.forEach((_, index) => {
              minusPoints += INDEX_TO_MINUS_POINTS[index] || 0;
            });

            player.minusPoints = [];

            player.rightSlots.forEach((row) => {
              let filledSlotsCount = 0;

              row.forEach((slot) => {
                if (slot.tile) filledSlotsCount++;
              });

              if (filledSlotsCount === row.length) {
                shouldEndGame = true;
              }
            });

            G.scoreboard[player.id] += points - minusPoints;
          });

          if (shouldEndGame) {
            each(G.players, (player) => {
              const bonusRows: number[] = [];
              const bonusColors: GameTileType[] = [];
              const bonusColumns: number[] = [];

              const tileTypeCount: object = {};
              const tileColumnCount: object = {};

              player.rightSlots.forEach((slotRow) => {
                let filledSlotRows = 0;

                slotRow.forEach((slot) => {
                  if (slot.tile) {
                    filledSlotRows++;
                    tileTypeCount[slot.tile.type] =
                      tileTypeCount[slot.tile.type] + 1 || 1;

                    if (tileTypeCount[slot.tile.type] === 5) {
                      bonusColors.push(slot.tile.type);
                    }

                    tileColumnCount[slot.colIndex] =
                      tileColumnCount[slot.colIndex + 1] || 1;

                    if (tileColumnCount[slot.colIndex] === 5) {
                      bonusColumns.push(slot.colIndex);
                    }
                  }
                });

                if (filledSlotRows === slotRow.length) {
                  bonusRows.push(slotRow[0].rowIndex);
                }
              });

              const rowBonusPoints = bonusRows.length * 2;
              const columnBonusPoints = bonusColumns.length * 8;
              const colorBonusPoints = bonusColors.length * 10;

              G.scoreboard[player.id] +=
                rowBonusPoints + columnBonusPoints + colorBonusPoints;
            });

            G.shouldEndGame = true;
          }

          const { updatedTilesInPool, updatedUsedTiles, tileGroups } =
            getTileGroups(
              G.tilesInPool,
              G.usedTiles,
              PLAYERS_COUNT_TO_GROUPS[ctx.numPlayers]
            );

          G.usedTiles = updatedUsedTiles;
          G.tileGroups = tileGroups;
          G.tilesInPool = updatedTilesInPool;
          overrideNextUser = G.beginTileOwner;
          G.beginTileOwner = null;
        }

        G.hasPickedTiles = false;

        if (overrideNextUser) {
          events.endTurn({ next: overrideNextUser });
        } else {
          events.endTurn();
        }
      },
    },

    pickTiles: {
      undoable: true,
      client: true,
      move: ({ G, ctx }, tiles, tileGroupId, targetSlotId) => {
        if (G.hasPickedTiles) return INVALID_MOVE;

        const isMiddleGroup = tileGroupId === "middle";
        const tileGroup = isMiddleGroup
          ? G.tileMiddleGroup
          : G.tileGroups[tileGroupId];

        const [selectedTiles, tilesForMiddle] = partition(
          tileGroup,
          ({ type }) => type === tiles[0].type
        );

        const playerBoard = G.players[ctx.currentPlayer];

        if (targetSlotId === "minus-points") {
          playerBoard.minusPoints.push(...selectedTiles);
        } else {
          const targetSlot = playerBoard.leftSlots[targetSlotId];

          let emptySlotCount = targetSlot.filter((s) => s === null).length;

          if (targetSlot[0] && targetSlot[0].type !== selectedTiles[0].type) {
            return INVALID_MOVE;
          }

          const correspondingRightSlot = playerBoard.rightSlots[
            targetSlotId
          ].find((slot) => slot.type === selectedTiles[0].type);
          if (!!correspondingRightSlot?.tile) {
            return INVALID_MOVE;
          }

          selectedTiles.forEach((tile) => {
            if (emptySlotCount > 0) {
              targetSlot[targetSlot.indexOf(null)] = tile;
            } else {
              playerBoard.minusPoints.push(tile);
            }

            emptySlotCount--;
          });
        }

        tileGroup.length = 0;
        G.tileMiddleGroup = tilesForMiddle.concat(G.tileMiddleGroup);

        if (isMiddleGroup && !G.beginTileOwner) {
          playerBoard.minusPoints.push("begin-tile");
          G.beginTileOwner = ctx.currentPlayer;
        }

        G.hasPickedTiles = true;
      },
    },
  },
};
