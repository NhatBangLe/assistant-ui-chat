'use client';

import { useEffect, useMemo, useState } from 'react';
import {
	useExternalStoreRuntime,
	ThreadMessageLike,
	AppendMessage,
	AssistantRuntimeProvider,
	ExternalStoreThreadData,
	ExternalStoreThreadListAdapter,
	TextContentPart,
	ToolCallContentPart,
	ThreadAssistantContentPart,
	Attachment,
	CompleteAttachment,
	PendingAttachment,
	ImageContentPart,
} from '@assistant-ui/react';
import {
	createNewThread,
	deleteAttachment,
	getAttachmentURL,
	streamChat,
	uploadAttachment,
} from '@/api';
import { generateId } from '@/lib/utils';
import { useThreadContext } from '../contexts/ThreadProvider';
import { Thread } from '@/components/thread';
import { ThreadList } from '@/components/thread-list';
import { AIMessageChunk, ToolMessageChunk } from '@langchain/core/messages';

export default function ChatWithThreads() {
	const { currentThreadId, setCurrentThreadId, threads, setThreads } =
		useThreadContext();
	const [threadList, setThreadList] = useState<
		ExternalStoreThreadData<'regular' | 'archived'>[]
	>([]);

	useEffect(() => {
		async function createThread() {
			// Create a new thread if the current one is 'default'
			const newTitle = 'New Chat';
			const newId = await createNewThread({ title: newTitle });
			setThreadList((prev) => [
				...prev,
				{
					threadId: newId,
					status: 'regular',
					title: newTitle,
				},
			]);
			setCurrentThreadId(newId);
		}

		if (currentThreadId === 'default') createThread();
	}, [currentThreadId, setCurrentThreadId]);

	// Get messages for current thread
	const currentMessages = useMemo(
		() => threads.get(currentThreadId) ?? [],
		[currentThreadId, threads]
	);

	const threadListAdapter: ExternalStoreThreadListAdapter = {
		threadId: currentThreadId,
		threads: threadList.filter(
			(t) => t.status === 'regular'
		) as ExternalStoreThreadData<'regular'>[],
		onSwitchToNewThread: async () => {
			const newTitle = 'New Chat';
			const newId = await createNewThread({ title: newTitle });
			setThreadList((prev) => [
				...prev,
				{
					threadId: newId,
					status: 'regular',
					title: newTitle,
				},
			]);
			setThreads((prev) => new Map(prev).set(newId, []));
			setCurrentThreadId(newId);
		},
		onSwitchToThread: (threadId) => {
			setCurrentThreadId(threadId);
		},
		// onRename: (threadId, newTitle) => {
		// 	setThreadList((prev) =>
		// 		prev.map((t) =>
		// 			t.threadId === threadId ? { ...t, title: newTitle } : t
		// 		)
		// 	);
		// },
		// onArchive: (threadId) => {
		// 	setThreadList((prev) =>
		// 		prev.map((t) =>
		// 			t.threadId === threadId ? { ...t, status: 'archived' } : t
		// 		)
		// 	);
		// },
		onDelete: (threadId) => {
			setThreadList((prev) => prev.filter((t) => t.threadId !== threadId));
			setThreads((prev) => {
				const next = new Map(prev);
				next.delete(threadId);
				return next;
			});
			if (currentThreadId === threadId) {
				setCurrentThreadId('default');
			}
		},
	};

	const [isRunning, setIsRunning] = useState(false);

	const onNew = async (message: AppendMessage) => {
		let threadId = currentThreadId;
		if (currentThreadId === 'default') {
			// Create a new thread if the current one is 'default'
			const newTitle = 'New Chat';
			const newId = await createNewThread({ title: newTitle });
			setThreadList((prev) => [
				...prev,
				{
					threadId: newId,
					status: 'regular',
					title: newTitle,
				},
			]);
			setCurrentThreadId(newId);
			threadId = newId;
		}

		let currMsgs = currentMessages;

		// Add user message
		const userMessage: ThreadMessageLike = {
			id: generateId(),
			...message,
			role: 'user',
		};
		currMsgs = [...currMsgs, userMessage];
		setThreads((prev) => new Map(prev).set(threadId, currMsgs));

		setIsRunning(true);

		// Stream response
		let currAssistantMessageId: string | undefined = undefined;
		const stream = streamChat(threadId, message);
		for await (const chunk of stream) {
			if (chunk instanceof AIMessageChunk) {
				currAssistantMessageId = chunk.id;
				const tool_calls = (chunk.tool_calls ?? []).map(
					(call) =>
						({
							type: 'tool-call' as const,
							toolCallId: call.id,
							toolName: call.name,
							args: call.args,
						} as ToolCallContentPart)
				);
				const existChunk = currMsgs.find(
					(m) => m.id === currAssistantMessageId
				);

				if (!existChunk) {
					const assistantMessage: ThreadMessageLike = {
						role: 'assistant',
						content: [{ type: 'text', text: chunk.text }, ...tool_calls],
						id: currAssistantMessageId,
					};
					currMsgs = [...currMsgs, assistantMessage];
				} else
					currMsgs = currMsgs.map((m) =>
						m.id === currAssistantMessageId
							? {
									...m,
									content: [
										{
											type: 'text',
											text: (m.content[0] as TextContentPart).text + chunk.text,
										} as TextContentPart,
										...tool_calls,
									],
							  }
							: m
					);
			} else if (chunk instanceof ToolMessageChunk) {
				const existChunk = currMsgs.find(
					(m) => m.id === currAssistantMessageId
				);
				if (!existChunk) {
					const toolMessage = {
						role: 'assistant',
						content: [
							{
								type: 'tool-call' as const,
								toolCallId: chunk.tool_call_id,
								toolName: chunk.name,
								artifact: chunk.artifact,
								isError: chunk.status === 'error',
								result: chunk.content,
							} as ToolCallContentPart,
						],
						id: chunk.id,
					} as ThreadMessageLike;
					currMsgs = [...currMsgs, toolMessage];
				} else
					currMsgs = currMsgs.map((m) => {
						if (m.id === chunk.id) {
							const newContent = (
								m.content as ThreadAssistantContentPart[]
							).map((part) => {
								if (
									part.type === 'tool-call' &&
									part.toolCallId === chunk.tool_call_id
								)
									return {
										...part,
										result: chunk.content,
										isError: chunk.status === 'error',
										artifact: chunk.artifact,
									};
								return part;
							});
							return {
								...m,
								content: newContent,
							};
						} else return m;
					});
			} else continue;
			setThreads((prev) => new Map(prev).set(threadId, currMsgs));
		}

		setIsRunning(false);
	};

	const runtime = useExternalStoreRuntime({
		messages: currentMessages,
		convertMessage: (msg) => msg,
		setMessages: (messages) => {
			setThreads((prev) => new Map(prev).set(currentThreadId, messages));
		},
		isRunning,
		onNew,
		adapters: {
			attachments: {
				accept: 'image/*',
				add: async function ({ file }): Promise<PendingAttachment> {
					const maxSizeBytes = 5 * 1024 * 1024; // 5MB
					// Validate file size
					if (file.size > maxSizeBytes) {
						return {
							id: generateId(),
							type: 'image',
							contentType: file.type,
							name: file.name,
							file,
							status: {
								type: 'incomplete',
								reason: 'error',
							},
						} as PendingAttachment;
					}

					const attachmentId = await uploadAttachment(currentThreadId, file);
					const attachmentURL = getAttachmentURL(attachmentId);

					return {
						id: attachmentId,
						type: 'image',
						contentType: file.type,
						content: [
							{
								type: 'image',
								image: attachmentURL,
							} as ImageContentPart,
						],
						name: file.name,
						status: {
							type: 'running',
						},
					} as PendingAttachment;
				},
				send: async function (attachment): Promise<CompleteAttachment> {
					return {
						...attachment,
						status: { type: 'complete' },
					} as CompleteAttachment;
				},
				remove: async function (attachment: Attachment): Promise<void> {
					await deleteAttachment(attachment.id);
				},
			},
			threadList: threadListAdapter,
		},
	});

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			<div className="grid h-screen grid-cols-[200px_1fr]">
				<ThreadList />
				<Thread />
			</div>
		</AssistantRuntimeProvider>
	);
}
