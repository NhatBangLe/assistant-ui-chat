'use server';

import { Thread } from '@/components/thread';
import { ThreadList } from '@/components/thread-list';
import { AgentRuntimeProvider } from '../contexts/AgentRuntimeProvider';

export default async function Page() {
	return (
		<div className="grid h-screen overflow-y-auto grid-cols-[200px_1fr]">
			<AgentRuntimeProvider>
				<ThreadList />
				<Thread />
			</AgentRuntimeProvider>
		</div>
	);
}
