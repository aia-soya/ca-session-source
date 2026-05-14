import type { Message, MessageAnchor } from "./types.js";
export declare class SessionMessageBuffer {
    private readonly messagesByOrdinal;
    private earliestOrdinalValue;
    private latestOrdinalValue;
    private sortedMessagesCache;
    readonly sessionId: string;
    constructor(sessionId: string, initialMessages?: Message[]);
    get size(): number;
    get latestOrdinal(): number;
    get earliestOrdinal(): number;
    get messages(): Message[];
    get latestMessage(): Message | undefined;
    get latestAnchor(): MessageAnchor | undefined;
    append(messages: Message[]): Message[];
}
export declare function createMessageAnchor(message: Message): MessageAnchor;
