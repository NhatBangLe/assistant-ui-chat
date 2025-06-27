import { AppendMessage, TextContentPart } from '@assistant-ui/react';
import { threadInstance } from '.';

/**
 *
 * @returns A created thread ID.
 */
export const createNewThread = async (data: CreateThreadRequest) => {
	const userId = process.env.NEXT_PUBLIC_USER_ID;
	const response = await threadInstance.post<string>(`/${userId}`, data);
	return response.data;
};

const convertMessage = (message: AppendMessage): ThreadMessageRequest => {
	return {
		attachments: message.attachments?.map((attachment) => ({
			id: attachment.id,
		})),
		content:
			message.content?.length !== 0
				? (message.content[0] as TextContentPart).text
				: '',
	};
};

export async function* streamChat(threadId: string, message: AppendMessage) {
	const baseURL = threadInstance.defaults.baseURL ?? 'localhost:8080/threads';
	const res = await fetch(`${baseURL}/${threadId}/messages`, {
		method: 'POST',
		body: JSON.stringify(convertMessage(message)),
		headers: {
			'Content-Type': 'application/json',
			Accept: 'text/event-stream',
		},
	});
	let initStr = '';
	if (res.body) {
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			const decChunk = decoder.decode(value, { stream: true });
			initStr += decChunk;
			yield initStr;
		}
	}
}
