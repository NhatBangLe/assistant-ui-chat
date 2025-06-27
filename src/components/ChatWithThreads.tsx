'use client';

import { useMemo, useState } from 'react';
import {
	useExternalStoreRuntime,
	ThreadMessageLike,
	AppendMessage,
	AssistantRuntimeProvider,
	ExternalStoreThreadData,
	ExternalStoreThreadListAdapter,
	useExternalMessageConverter,
} from '@assistant-ui/react';
import { ImageAttachmentAdapter } from '@/lib/adapters/image';
import { createNewThread, streamChat } from '@/api';
import { generateId } from '@/lib/utils';
import { useThreadContext } from '../contexts/ThreadProvider';
import { Thread } from '@/components/thread';
import { ThreadList } from '@/components/thread-list';

export default function ChatWithThreads() {
	const { currentThreadId, setCurrentThreadId, threads, setThreads } =
		useThreadContext();
	const [threadList, setThreadList] = useState<
		ExternalStoreThreadData<'regular' | 'archived'>[]
	>([]);

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
			role: 'user',
			content: message.content,
		};
		currMsgs = [...currMsgs, userMessage];
		setThreads((prev) => new Map(prev).set(threadId, currMsgs));

		setIsRunning(true);

		// Create placeholder for assistant message
		const assistantMsgId = generateId();
		const assistantMessage: ThreadMessageLike = {
			role: 'assistant',
			content: [{ type: 'text', text: '' }],
			id: assistantMsgId,
		};
		currMsgs = [...currMsgs, assistantMessage];
		setThreads((prev) => new Map(prev).set(threadId, currMsgs));

		// Stream response
		const stream = streamChat(threadId, message);
		for await (const chunk of stream) {
			currMsgs = currMsgs.map((m) =>
				m.id === assistantMsgId
					? {
							...m,
							content: [
								{
									type: 'text',
									text: chunk,
								},
							],
					  }
					: m
			);
			setThreads((prev) => new Map(prev).set(threadId, currMsgs));
		}

		setIsRunning(false);
	};

	const convertedMessages = useExternalMessageConverter({
		callback: (message: ThreadMessageLike): ThreadMessageLike => ({
			// role: message.role,
			// content: [
			// 	{
			// 		type: 'text',
			// 		text: (message.content[0] as TextContentPart).text,
			// 	} as TextContentPart,
			// ],
			// id: message.id,
			...message,
			createdAt: new Date(),
		}),
		messages: currentMessages,
		isRunning,
		joinStrategy: 'concat-content', // Merge adjacent assistant messages
	});

	const runtime = useExternalStoreRuntime({
		messages: convertedMessages,
		setMessages: (messages) => {
			setThreads((prev) => new Map(prev).set(currentThreadId, messages));
		},
		isRunning,
		onNew,
		adapters: {
			attachments: new ImageAttachmentAdapter(),
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
