'use client';

import { useState } from 'react';
import {
	useExternalStoreRuntime,
	ThreadMessageLike,
	AppendMessage,
	AssistantRuntimeProvider,
	TextContentPart,
	ExternalStoreThreadData,
	ExternalStoreThreadListAdapter,
} from '@assistant-ui/react';
import { ImageAttachmentAdapter } from '@/lib/adapters/image';
import { createNewThread, streamChat } from '@/api';
import { generateId } from '@/lib/utils';
import { useThreadContext } from './ThreadProvider';

// const convertMessage = (message: ThreadMessageResponse): ThreadMessageLike => ({
// 	id: message.id,
// 	role: message.role,
// 	content: [{ type: 'text', text: message.content }],
// 	createdAt: new Date(),
// });

const convertMessage = (message: ThreadMessageLike): ThreadMessageLike =>
	message;

export function AgentRuntimeProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { currentThreadId, setCurrentThreadId, threads, setThreads } =
		useThreadContext();
	const [threadList, setThreadList] = useState<
		ExternalStoreThreadData<'regular' | 'archived'>[]
	>([{ threadId: 'default', status: 'regular', title: 'New Chat' }]);

	// Get messages for current thread
	const currentMessages = threads.get(currentThreadId) || [];

	const threadListAdapter: ExternalStoreThreadListAdapter = {
		threadId: currentThreadId,
		threads: threadList.filter(
			(t) => t.status === 'regular'
		) as ExternalStoreThreadData<'regular'>[],
		archivedThreads: threadList.filter(
			(t) => t.status === 'archived'
		) as ExternalStoreThreadData<'archived'>[],
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
		// Add user message
		const userMessage: ThreadMessageLike = {
			id: generateId(),
			role: 'user',
			content: message.content,
		};
		setThreads((prev) =>
			new Map(prev).set(currentThreadId, [...currentMessages, userMessage])
		);

		// Create placeholder for assistant message
		setIsRunning(true);
		const assistantMsgId = generateId();
		const assistantMessage: ThreadMessageLike = {
			role: 'assistant',
			content: [{ type: 'text', text: '' }],
			id: assistantMsgId,
		};
		setThreads((prev) =>
			new Map(prev).set(currentThreadId, [...currentMessages, assistantMessage])
		);

		// Stream response
		const stream = streamChat('1', message);
		for await (const chunk of stream) {
			const matchedMessages = currentMessages.map((m) =>
				m.id === assistantMsgId
					? {
							...m,
							content: [
								{
									type: 'text',
									text: (m.content[0] as TextContentPart).text + chunk,
								} as TextContentPart,
							],
					  }
					: m
			);
			setThreads((prev) => new Map(prev).set(currentThreadId, matchedMessages));
		}
		setIsRunning(false);
	};
	const runtime = useExternalStoreRuntime({
		messages: currentMessages,
		setMessages: (messages) => {
			setThreads((prev) => new Map(prev).set(currentThreadId, messages));
		},
		isRunning,
		onNew,
		convertMessage,
		adapters: {
			attachments: new ImageAttachmentAdapter(),
			threadList: threadListAdapter,
		},
	});

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			{children}
		</AssistantRuntimeProvider>
	);
}
