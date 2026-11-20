import { useBoardContext } from "./BoardContext";
import { Trans } from "react-i18next";
import { Button } from "components/Button";
import { useStoreActions } from "../../store";

export const PlayerControls = () => {
  const { isActive, moves, ctx, undo, State, playerID, playersInfo } =
    useBoardContext();
  const hasPicked = !!State?.hasPickedTiles;
  const canUndo = !!isActive && hasPicked;
  const setShowRulebook = useStoreActions((s) => s.setShowRulebook);

  // 自動排除 🤖 電腦，僅計算真人玩家
  const humanIds = (playersInfo || [])
    .filter((p) => !p.name?.startsWith("🤖"))
    .map((p) => String(p.id));

  const endGameVotes = State?.endGameVotes || [];
  const votedCount = humanIds.filter((id) => endGameVotes.includes(id)).length;
  const myId = playerID !== undefined ? String(playerID) : "";
  const isHumanPlayer = humanIds.includes(myId);
  const hasVoted = endGameVotes.includes(myId);

  const voteLabel =
    humanIds.length <= 1
      ? "終結遊戲"
      : hasVoted
      ? `取消終結 (${votedCount}/${humanIds.length})`
      : votedCount > 0
      ? `同意終結 (${votedCount}/${humanIds.length})`
      : "終結遊戲";

  return (
    <div className="PlayerControls">
      <Button
        theme="pink"
        size="small"
        className="PlayerControls__button"
        onClick={() => {
          gtag("event", "rulebook");
          setShowRulebook(true);
        }}
      >
        <Trans>Rulebook</Trans>
      </Button>

      <Button
        theme="yellow"
        size="small"
        className="PlayerControls__button"
        disabled={!canUndo}
        onClick={() => {
          if (!canUndo) return;
          gtag("event", "undo");
          try {
            undo();
          } catch (e) {
            // Ignore when there is nothing to undo
          }
        }}
      >
        <Trans>Undo</Trans>
      </Button>

      <Button
        theme="green"
        onClick={() => {
          gtag("event", "end-turn");
          moves.endTurn();
        }}
        className="PlayerControls__button"
        size="small"
        disabled={!hasPicked || !isActive}
      >
        <Trans>End Turn</Trans>
      </Button>

      {isHumanPlayer && !ctx?.gameover && (
        <Button
          theme={hasVoted ? "yellow" : "pink"}
          size="small"
          className="PlayerControls__button"
          onClick={() => {
            moves.voteEndGame(humanIds);
          }}
        >
          {voteLabel}
        </Button>
      )}
    </div>
  );
};
