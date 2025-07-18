import { deleteImage, getShowingImageUrl, postImage } from '@/api';
import {
	Attachment,
	AttachmentAdapter,
	CompleteAttachment,
	PendingAttachment,
} from '@assistant-ui/react';
import { generateId } from '../utils';

class ImageAttachmentAdapter implements AttachmentAdapter {
	maxSizeBytes = 5 * 1024 * 1024; // 5MB

	accept = 'image/*';
	async add({ file }: { file: File }): Promise<PendingAttachment> {
		// Validate file size
		if (file.size > this.maxSizeBytes) {
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
			};
		}

		const imageId = await postImage(file);
		const url = getShowingImageUrl(imageId);

		return {
			id: imageId,
			file: file,
			type: 'image',
			contentType: file.type,
			content: [
				{
					type: 'image',
					image: url,
				},
			],
			name: file.name,
			status: {
				type: 'running',
			},
		} as PendingAttachment;
	}
	async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
		const url = getShowingImageUrl(attachment.id);
		return {
			id: attachment.id,
			type: attachment.type,
			name: attachment.name,
			contentType: attachment.file.type,
			content: [
				{
					type: 'image',
					image: url,
				},
			],
			status: { type: 'complete' },
		} as CompleteAttachment;
	}
	async remove(attachment: Attachment): Promise<void> {
		await deleteImage(attachment.id);
	}
}

export { ImageAttachmentAdapter };
