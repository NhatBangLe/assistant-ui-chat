import { imageInstance } from '.';

export const getShowingImageUrl = (imageId: string) => {
	const baseUrl =
		imageInstance.defaults.baseURL ?? 'localhost:8080/api/v1/images';
	return `${baseUrl}/${imageId}/show`;
};

export const getImageMetadata = async (imageId: string) => {
	const response = await imageInstance.get<ImageMetadataResponse>(
		`/${imageId}/info`
	);
	const responseData = response.data;
	return {
		id: responseData.id,
		name: responseData.name,
		mimeType: responseData.mime_type,
		createdAt: new Date(responseData.created_at),
	} as ImageMetadata;
};

/**
 *
 * @param file File to upload
 * @returns Uploaded image ID
 */
export const postImage = async (
	file: File,
	onUploadProgress?: (progress: number) => void
) => {
	const userId = process.env.NEXT_PUBLIC_USER_ID;

	const formData = new FormData();
	formData.append('file', file);
	const response = await imageInstance.postForm<string>(
		`/${userId}/upload`,
		formData,
		{
			onUploadProgress: (progressEvent) => {
				onUploadProgress?.(progressEvent.progress!);
			},
		}
	);
	return response.data;
};

export const deleteImage = async (imageId: string) => {
	await imageInstance.delete(`/${imageId}`);
};
