import times from "lodash/times";

import { GameTileType } from "../../game";
import { useBoardContext } from "./BoardContext";
import { TileFull, TileEmptySlot } from "./Tile";
import classNames from "classnames";
import sortBy from "lodash/sortBy";

export const TilesBoard = () => {
  const { State, selectedTiles, setSelectedTiles, ctx } = useBoardContext();

  const isFourPlayers = ctx.numPlayers === 4;
  const isThreePlayers = ctx.numPlayers === 3;

  return (
    <div
      className={classNames(
        "TilesBoard",
        isFourPlayers && "TilesBoard--4-players",
        isThreePlayers && "TilesBoard--3-players"
      )}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1.25em",
        width: "100%",
        height: "auto",
        marginBottom: "1em",
      }}
    >
      {/* 工廠圓盤區：所有圓盤統一正圓並水平對齊 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "1.25em",
          maxWidth: isFourPlayers ? "58em" : "56em",
        }}
      >
        {State.tileGroups.map((tileGroup, tileGroupIndex) => {
          return (
            <div
              key={tileGroupIndex}
              className={classNames("TilesContainer", "TilesBoard__tile")}
              style={{
                width: "9.5em",
                height: "9.5em",
                aspectRatio: "1 / 1",
                margin: 0,
                position: "static",
                transform: "none",
                flexShrink: 0,
              }}
            >
              {times(4, (index) => {
                const tile = tileGroup[index];

                if (tile) {
                  const isSelected = !!selectedTiles?.tiles.find(
                    ({ id }) => id === tile.id
                  );

                  return (
                    <TileFull
                      movable
                      type={tile.type}
                      onClick={() => {
                        setSelectedTiles({
                          groupId: tileGroupIndex,
                          tiles: tileGroup.filter(
                            ({ type }) => tile.type === type
                          ),
                        });
                      }}
                      key={tile.id}
                      isSelected={isSelected}
                    />
                  );
                }

                return <TileEmptySlot key={`empty-tile-${index}`} />;
              })}
            </div>
          );
        })}
      </div>

      {/* 中央棄牌區（含 1 號起始標記）：獨立排在圓盤下方，避免重疊 */}
      <div
        className="TilesBoard__middle"
        style={{
          position: "static",
          transform: "none",
          margin: 0,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "0.4em",
          minHeight: "2.5em",
          maxWidth: "40em",
        }}
      >
        {!State.beginTileOwner && (
          <TileFull
            type={GameTileType.BEGIN}
            isSelected={selectedTiles?.groupId === "middle"}
          />
        )}

        {sortBy(State.tileMiddleGroup, "type").map((tile) => {
          const isSelected = !!selectedTiles?.tiles.find(
            ({ id }) => id === tile.id
          );

          return (
            <TileFull
              movable
              type={tile.type}
              key={tile.id}
              isSelected={isSelected}
              onClick={() => {
                setSelectedTiles({
                  groupId: "middle",
                  tiles: State.tileMiddleGroup.filter(
                    ({ type }) => tile.type === type
                  ),
                });
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
