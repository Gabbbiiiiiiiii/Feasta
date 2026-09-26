import type {ChatMessage} from "./messaging-types";

export function chronologicalChatMessages(
  messages: readonly ChatMessage[],
): ChatMessage[] {
  return [...messages].sort((left, right) => {
    const time = new Date(left.createdAt).getTime() -
      new Date(right.createdAt).getTime();

    return time === 0 ? left.id.localeCompare(right.id) : time;
  });
}

export function mergeChatMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map(
    current.map((message) => [message.id, message]),
  );

  for (const message of incoming) byId.set(message.id, message);
  return chronologicalChatMessages([...byId.values()]);
}
