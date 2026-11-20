import React, { useEffect } from "react";
import { Client } from "boardgame.io/client";
import { SocketIO } from "boardgame.io/multiplayer";
import { SERVER_URL } from "../../config/client";
import { MosaicGame, GameState } from "../../game";
import { chooseBestMove } from "../../game/bot";
import { getRoomBots } from "../../store/store";

interface BotManagerProps {
  roomID?: string;
}

export const BotManager: React.FC<BotManagerProps> = ({ roomID }) => {
  useEffect(() => {
    if (!roomID) return;

    const bots = getRoomBots(roomID);
    if (bots.length === 0) return;

    const cleanups: (() => void)[] = [];

    bots.forEach((bot) => {
      const botIdStr = String(bot.playerID);

      // 建立不渲染畫面的背景 Socket 連線
      const client = Client({
        game: MosaicGame,
        multiplayer: SocketIO({ server: SERVER_URL }),
        matchID: roomID,
        gameID: roomID,
        playerID: botIdStr,
        credentials: bot.credential,
      } as any);

      let timerId: ReturnType<typeof setTimeout> | null = null;
      let isScheduling = false;

      const unsubscribe = client.subscribe((state: any) => {
        if (!state || state.ctx?.gameover) return;
        if (state.ctx?.currentPlayer !== botIdStr) {
          isScheduling = false;
          return;
        }
        if (isScheduling) return;

        const numMoves = state.ctx?.numMoves ?? 0;

        if (numMoves === 0) {
          // 階段 1：思考並執行拿磚
          isScheduling = true;
          timerId = setTimeout(() => {
            const latest = client.getState() as any;
            if (
              !latest ||
              latest.ctx?.gameover ||
              latest.ctx?.currentPlayer !== botIdStr ||
              (latest.ctx?.numMoves ?? 0) > 0
            ) {
              isScheduling = false;
              return;
            }

            const move = chooseBestMove(latest.G as GameState, botIdStr);
            if (move) {
              client.moves.pickTiles(
                move.tiles,
                move.tileGroupId,
                move.targetSlotId
              );
            }
            isScheduling = false;
          }, 800);
        } else {
          // 階段 2：已拿磚，短暫停頓後自動結束回合
          isScheduling = true;
          timerId = setTimeout(() => {
            const latest = client.getState() as any;
            if (
              !latest ||
              latest.ctx?.gameover ||
              latest.ctx?.currentPlayer !== botIdStr ||
              (latest.ctx?.numMoves ?? 0) === 0
            ) {
              isScheduling = false;
              return;
            }

            client.moves.endTurn();
            isScheduling = false;
          }, 500);
        }
      });

      client.start();

      cleanups.push(() => {
        if (timerId) clearTimeout(timerId);
        unsubscribe();
        client.stop();
      });
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [roomID]);

  return null;
};
