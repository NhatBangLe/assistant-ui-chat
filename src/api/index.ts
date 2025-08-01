import axios from 'axios';

export const threadInstance = axios.create({
	baseURL: `${process.env.NEXT_PUBLIC_AGENT_SERVER}/threads`,
});

import {
	streamChat,
	createNewThread,
	postAttachment,
	getAttachmentMetadata,
	deleteAttachment,
	getAttachmentURL,
} from './thread';

export {
	streamChat,
	createNewThread,
	postAttachment as uploadAttachment,
	getAttachmentMetadata,
	deleteAttachment,
	getAttachmentURL,
};
