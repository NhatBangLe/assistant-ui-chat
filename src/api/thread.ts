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
		attachment_id:
			message.attachments && message.attachments?.length !== 0
				? message.attachments[0].id
				: null,
		content:
			message.content?.length !== 0
				? (message.content[0] as TextContentPart).text
				: '',
	};
};

/**
 *
 * @throws Error if cannot parse the chunk
 */
const convertChunk = (
	chunk: string
): BaseMessageChunk | AIMessageChunk | ToolMessageChunk => {
	const parsedChunk = JSON.parse(chunk);
	const chunkType = parsedChunk.type;
	if (chunkType === 'AIMessageChunk')
		return new AIMessageChunk({
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
		return new ToolMessageChunk({
			id: parsedChunk.id,
			tool_call_id: parsedChunk.tool_call_id,
			content: parsedChunk.content,
			name: parsedChunk.name,
			artifact: parsedChunk.artifact,
			status: parsedChunk.status,
			additional_kwargs: parsedChunk.additional_kwargs,
			response_metadata: parsedChunk.response_metadata,
		});
	} else return parsedChunk as BaseMessageChunk;
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
			const receivedChunk = remainingDecodedChunk + decodedChunk;

			try {
				const splittedChunks = receivedChunk.split('}{');
				if (splittedChunks.length > 1) {
					for (const chunk of splittedChunks) {
						let completeChunk = chunk;
						if (!chunk.startsWith('{')) completeChunk = '{' + chunk;
						if (!chunk.endsWith('}')) completeChunk += '}';
						const convertedChunk = convertChunk(completeChunk);
						yield convertedChunk;
					}
				} else {
					const convertedChunk = convertChunk(receivedChunk);
					yield convertedChunk;
				}
				remainingDecodedChunk = '';
			} catch (error) {
				console.warn(error);
				remainingDecodedChunk = receivedChunk;
			}
		}
	}
}

export const getAttachmentMetadata = async (attachmentId: string) => {
	const response = await threadInstance.get<AttachmentMetadataResponse>(
		`/attachment/${attachmentId}/metadata`
	);
	const data = response.data;
	return {
		id: data.id,
		name: data.name,
		mimeType: data.mime_type,
		path: data.path,
	} as AttachmentMetadata;
};

/**
 *
 * @param file File to upload
 * @returns Uploaded image ID
 */
export const postAttachment = async (
	threadId: string,
	file: File,
	onUploadProgress?: (progress: number) => void
) => {
	const formData = new FormData();
	formData.append('file', file);
	const response = await threadInstance.postForm<string>(
		`/attachment/${threadId}/upload`,
		formData,
		{
			onUploadProgress: (progressEvent) => {
				onUploadProgress?.(progressEvent.progress!);
			},
		}
	);
	return response.data;
};

export const deleteAttachment = async (attachmentId: string) => {
	await threadInstance.delete<void>(`/attachment/${attachmentId}`);
};
