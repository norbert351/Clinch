import { emitDealMessage } from '../../socket/gateway';
import { postSystemMessage } from '../../modules/messages/messages.service';

export async function postTimelineMessage(
  onChainId: number,
  content: string,
): Promise<void> {
  try {
    const message = await postSystemMessage(onChainId, content);
    if (message) {
      emitDealMessage(onChainId, message);
    }
  } catch (error) {
    console.warn(
      '[Timeline] Failed to post system message:',
      error instanceof Error ? error.message : error,
    );
  }
}
