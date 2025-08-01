declare interface ImageMetadataResponse {
	id: string;
	name: string;
	mime_type: string;
	created_at: string;
}

declare interface CreateThreadRequest {
	title: string;
}

declare interface ThreadMessageRequest {
	attachment_id: string | null;
	content: string;
}

declare interface ThreadMessageResponse {
	id: string;
	role: 'user' | 'assistant';
	content: string;
}

declare interface AttachmentMetadataResponse {
	id: string;
	name: string;
	mime_type: string | null;
	url: string;
}
