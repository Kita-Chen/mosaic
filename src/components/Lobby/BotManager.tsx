import React, { useEffect, useMemo } from "react";
import { Client, BoardProps } from "boardgame.io/react";
import { SocketIO } from "boardgame.io/multiplayer";
import { SERVER_URL } from "../../config/client";
import { MosaicGame, GameState } from "../../game";
import { chooseBestMove } from "../../game/bot";
import { getRoomBots } from "../../store/store";

const BotBoard: React.FC<BoardProps<GameState>> = ({
  G,
  ctx,
  moves,
  playerID,
}) => {
  useEffect(() => {
    if (!playerID || ctx?.gameover) return;

    const botIdStr = String(playerID);
    const currentPlayerStr = String(ctx?.currentPlayer);

    console.log("[BotBoard] sync:", {
      bot: botIdStr,
      currentPlayer: currentPlayerStr,
      hasPickedTiles: G?.hasPickedTiles,
    });

    if (currentPlayerStr !== botIdStr) return;

    if (!G?.hasPickedTiles) {
      // 階段 1：思考並執行拿磚
      const timer = setTimeout(() => {
        const move = chooseBestMove(G, botIdStr);
        console.log(`[BotBoard] Bot ${botIdStr} pickTiles:`, move);
        if (move) {
          moves.pickTiles(move.tiles, move.tileGroupId, move.targetSlotId);
        }
      }, 800);

      return () => clearTimeout(timer);
    } else {
      // 階段 2：短暫停頓後自動結束回合
      const timer = setTimeout(() => {
        console.log(`[BotBoard] Bot ${botIdStr} endTurn`);
        moves.endTurn();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [G, ctx?.currentPlayer, ctx?.gameover, playerID, moves]);

  return null;
};

// 使用與主遊戲畫面完全相同的 boardgame.io/react Client 封裝
const BotClient = Client({
  game: MosaicGame,
  board: BotBoard,
  multiplayer: SocketIO({
    server: SERVER_URL,
    socketOpts: { forceNew: true },
  }),
});

interface BotManagerProps {
  roomID?: string;
}

export const BotManager: React.FC<BotManagerProps> = ({ roomID }) => {
  const bots = useMemo(() => (roomID ? getRoomBots(roomID) : []), [roomID]);

  useEffect(() => {
    console.log("[BotManager] mounted with bots:", { roomID, bots });
  }, [roomID, bots]);

  if (!roomID || bots.length === 0) return null;

  return (
    <div style={{ display: "none" }}>
      {bots.map((bot) => (
        <BotClient
          key={`${roomID}-${bot.playerID}`}
          gameID={roomID}
          playerID={String(bot.playerID)}
          credentials={bot.credential}
          debug={false}
        />
      ))}
    </div>
  );
};
