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
    console.log("[BotManager] init:", { roomID, bots });
    if (bots.length === 0) return;

    const cleanups: (() => void)[] = [];

    bots.forEach((bot) => {
      const botIdStr = String(bot.playerID);

      const client = Client({
        game: MosaicGame,
        multiplayer: SocketIO({ server: SERVER_URL }),
        matchID: roomID,
        gameID: roomID,
        playerID: botIdStr,
        credentials: bot.credential,
        debug: false,
      } as any);

      let timerId: ReturnType<typeof setTimeout> | null = null;
      let isScheduling = false;

      const tryAct = (state: any) => {
        if (!state || state.ctx?.gameover) return;
        if (state.isConnected === false) return;

        if (state.ctx?.currentPlayer !== botIdStr) {
          isScheduling = false;
          if (timerId) {
            clearTimeout(timerId);
            timerId = null;
          }
          return;
        }

        if (isScheduling) return;

        const hasPicked = !!(state.G as GameState)?.hasPickedTiles;
        isScheduling = true;

        if (!hasPicked) {
          // 階段 1：思考並執行拿磚
          timerId = setTimeout(() => {
            timerId = null;
            isScheduling = false;

            const latest = client.getState() as any;
            if (
              !latest ||
              latest.ctx?.gameover ||
              latest.ctx?.currentPlayer !== botIdStr ||
              (latest.G as GameState)?.hasPickedTiles
            ) {
              return;
            }

            const move = chooseBestMove(latest.G as GameState, botIdStr);
            console.log(`[BotManager] Bot ${botIdStr} pickTiles:`, move);
            if (move) {
              client.moves.pickTiles(
                move.tiles,
                move.tileGroupId,
                move.targetSlotId
              );
            }
          }, 800);
        } else {
          // 階段 2：短暫停頓後自動結束回合
          timerId = setTimeout(() => {
            timerId = null;
            isScheduling = false;

            const latest = client.getState() as any;
            if (
              !latest ||
              latest.ctx?.gameover ||
              latest.ctx?.currentPlayer !== botIdStr ||
              !(latest.G as GameState)?.hasPickedTiles
            ) {
              return;
            }

            console.log(`[BotManager] Bot ${botIdStr} endTurn`);
            client.moves.endTurn();
          }, 500);
        }
      };

      const unsubscribe = client.subscribe((state: any) => {
        tryAct(state);
      });

      const pollId = setInterval(() => {
        const latest = client.getState() as any;
        if (latest) tryAct(latest);
      }, 1500);

      client.start();

      cleanups.push(() => {
        if (timerId) clearTimeout(timerId);
        clearInterval(pollId);
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
