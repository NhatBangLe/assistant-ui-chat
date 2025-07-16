import { AppendMessage, TextContentPart } from '@assistant-ui/react';
import { threadInstance } from '.';
import {
	AIMessageChunk,
	BaseMessageChunk,
	ToolMessageChunk,
} from '@langchain/core/messages';

/**
 *
 * @returns A created thread ID.
 */
export const createNewThread = async (data: CreateThreadRequest) => {
	const userId = process.env.NEXT_PUBLIC_USER_ID;
	const response = await threadInstance.post<string>(`/${userId}/create`, data);
	return response.data;
};

const convertMessage = (message: AppendMessage): ThreadMessageRequest => {
	return {
		attachment:
			message.attachments && message.attachments?.length !== 0
				? { id: message.attachments[0].id }
				: null,
		content:
			message.content?.length !== 0
				? (message.content[0] as TextContentPart).text
				: '',
	};
};

export async function* streamChat(
	threadId: string,
	message: AppendMessage
): AsyncGenerator<
	BaseMessageChunk | AIMessageChunk | ToolMessageChunk,
	void,
	unknown
> {
	const baseURL = threadInstance.defaults.baseURL ?? 'localhost:8080/threads';
	const res = await fetch(
		`${baseURL}/${threadId}/messages?stream_mode=messages`,
		{
			method: 'POST',
			body: JSON.stringify(convertMessage(message)),
			headers: {
				'Content-Type': 'application/json',
				Accept: 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no',
			},
		}
	);

	if (res.body) {
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let remainingDecodedChunk = '';
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;

			const decodedChunk = decoder.decode(value, { stream: true });
			try {
				const parsedChunk = JSON.parse(remainingDecodedChunk + decodedChunk);
				remainingDecodedChunk = '';
				const chunkType = parsedChunk.type;
				if (chunkType === 'AIMessageChunk')
					yield new AIMessageChunk({
						content: parsedChunk.content,
						additional_kwargs: parsedChunk.additional_kwargs,
						response_metadata: parsedChunk.response_metadata,
						id: parsedChunk.id,
						tool_calls: parsedChunk.tool_calls,
						invalid_tool_calls: parsedChunk.invalid_tool_calls,
						usage_metadata: parsedChunk.usage_metadata,
						tool_call_chunks: parsedChunk.tool_call_chunks,
						name: undefined,
					});
				else if (chunkType === 'tool') {
					yield new ToolMessageChunk({
						id: parsedChunk.id,
						tool_call_id: parsedChunk.tool_call_id,
						content: parsedChunk.content,
						name: parsedChunk.name,
						artifact: parsedChunk.artifact,
						status: parsedChunk.status,
						additional_kwargs: parsedChunk.additional_kwargs,
						response_metadata: parsedChunk.response_metadata,
					});
				} else yield parsedChunk;
			} catch (error) {
				console.warn('Unterminated chunk: ', error);
				remainingDecodedChunk += decodedChunk;
			}
		}
	}
}
