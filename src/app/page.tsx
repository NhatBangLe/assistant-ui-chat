import ChatWithThreads from '@/components/ChatWithThreads';
import { ThreadProvider } from '@/contexts/ThreadProvider';

export default async function Page() {
	return (
		<ThreadProvider>
			<ChatWithThreads />
		</ThreadProvider>
	);
}
