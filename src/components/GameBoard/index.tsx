import { BoardProps } from "boardgame.io/react";
import React, { useState, useEffect } from "react";
import { GameState, GameTile, GameTileType } from "../../game/types";
import { BoardContext } from "./BoardContext";
import { PlayerBoard } from "./PlayerBoard";
import { Scoreboard } from "./Scoreboard";
import { TilesBoard } from "./TilesBoard";
import { useTranslation } from "react-i18next";
import { GameOver } from "./GameOver";
import { Sidebar } from "./Sidebar";
import classNames from "classnames";
import { useParams } from "react-router-dom";
import { useStoreState } from "../../store";

export interface SelectedTiles {
  tiles: GameTile[];
  groupId: number | "middle";
}

export const tileColorModifier: { [key in GameTileType]: string } = {
  [GameTileType.A]: "type-a",
  [GameTileType.B]: "type-b",
  [GameTileType.C]: "type-c",
  [GameTileType.D]: "type-d",
  [GameTileType.E]: "type-e",
  [GameTileType.BEGIN]: "type-begin",
};

const SIDEBAR_CONFIG_KEY = "sidebar_config";

export const GameBoard: React.FC<BoardProps<GameState>> = ({
  G: State,
  moves,
  isActive,
  ctx,
  playerID,
  undo,
  matchData,
  chatMessages,
  sendChatMessage,
}) => {
  const { watchId } = useParams();
  const { t } = useTranslation();
  const nickname = useStoreState((s) => s.nickname);
  const roomMetadata = useStoreState((s) => s.roomMetadata);
  const [selectedTiles, setSelectedTiles] = useState<SelectedTiles | undefined>(
    undefined
  );
  const [isSidebarPinned, setSidebarPinned] = useState(
    JSON.parse(localStorage.getItem(SIDEBAR_CONFIG_KEY) || '{ "pinned": true }')
      .pinned
  );

  // 啟用投票 stage 後所有玩家皆為 active，因此需明確比對 currentPlayer
  const isMyTurn =
    !!isActive &&
    playerID !== undefined &&
    String(ctx.currentPlayer) === String(playerID);

  const pickTiles = (
    tileIds: GameTile[],
    tileGroupId: number | "middle",
    targetSlotId: number | "minus-points"
  ) => {
    if (!isMyTurn) return;

    moves.pickTiles(tileIds, tileGroupId, targetSlotId);
    setSelectedTiles(undefined);
  };

  const alert = React.useMemo(() => {
    try {
      return new Audio(
        "https://freesound.org/data/previews/260/260614_4486188-lq.mp3"
      );
    } catch (e) {
      return undefined;
    }
  }, []);

  const [alertPlayed, setAlertPlayed] = useState(false);
  useEffect(() => {
    if (isMyTurn) {
      if (!alertPlayed && alert) {
        const playPromise = alert.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise
            .then(() => setAlertPlayed(true))
            .catch(() => {
              // Autoplay blocked; ignore
            });
        } else {
          setAlertPlayed(true);
        }
      }
    } else {
      if (alertPlayed) {
        setAlertPlayed(false);
      }
    }
  }, [alert, alertPlayed, isMyTurn]);

  useEffect(() => {
    if (!isMyTurn) return;

    const originalTitle = document.title;

    const interval = setInterval(() => {
      document.title =
        document.title === originalTitle
          ? `▼ ${t("Make a move")} ▼`
          : originalTitle;
    }, 1500);

    return () => {
      clearInterval(interval);
      document.title = originalTitle;
    };
  }, [t, isMyTurn]);

  const playersInfo = React.useMemo(() => {
    const ids: string[] = (ctx?.playOrder || []).map((p: any) => String(p));
    const matchPlayers = (matchData as any[]) || [];
    const lobbyPlayers = (roomMetadata?.players || []) as any[];

    return ids.map((id) => {
      const matchPlayer = matchPlayers.find((p) => String(p.id) === id);
      const lobbyPlayer = lobbyPlayers.find((p) => String(p.id) === id);
      const name =
        (matchPlayer && (matchPlayer as any).name) ||
        (lobbyPlayer && (lobbyPlayer as any).name) ||
        (String(playerID) === id ? nickname : undefined) ||
        `Player ${Number(id) + 1}`;
      return { id, name };
    });
  }, [ctx?.playOrder, matchData, roomMetadata, playerID, nickname]);

  return (
    <BoardContext.Provider
      value={{
        playerID: playerID || watchId,
        moves,
        State,
        isActive: isMyTurn,
        ctx,
        undo,
        chatMessages,
        sendChatMessage,
        pickTiles,
        selectedTiles,
        setSelectedTiles,
        isSidebarPinned,
        setSidebarPinned: (value) => {
          setSidebarPinned(value);
          localStorage.setItem(
            SIDEBAR_CONFIG_KEY,
            JSON.stringify({ pinned: value })
          );
        },
        playersInfo,
      }}
    >
      <div
        className={classNames(
          "h-screen flex items-center justify-center flex-col",
          isSidebarPinned && "pl-[400px]"
        )}
      >
        <Sidebar />
        {!!ctx.gameover && <GameOver />}
        <TilesBoard />
        <PlayerBoard />
      </div>
    </BoardContext.Provider>
  );
};
