declare interface ImageMetadata {
	id: string;
	name: string;
	mimeType: string;
	createdAt: Date;
}

declare interface AttachmentMetadata {
	id: string;
	name: string;
	mimeType: string | null;
	path: string;
}
