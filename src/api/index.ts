import axios from 'axios';

export const threadInstance = axios.create({
	baseURL: `${process.env.NEXT_PUBLIC_AGENT_SERVER}/threads`,
});

import { streamChat, createNewThread } from './thread';
export { streamChat, createNewThread };

export const imageInstance = axios.create({
	baseURL: `${process.env.NEXT_PUBLIC_AGENT_SERVER}/api/v1/images`,
});

import {
	getShowingImageUrl,
	getImageMetadata,
	postImage,
	deleteImage,
} from './image';

export { getShowingImageUrl, getImageMetadata, postImage, deleteImage };
