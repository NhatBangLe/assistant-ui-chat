'use client';

import { useEffect, useState, type FC } from 'react';
import { CircleXIcon, FileIcon, PaperclipIcon } from 'lucide-react';
import {
	AttachmentPrimitive,
	ComposerPrimitive,
	MessagePrimitive,
	useAttachment,
} from '@assistant-ui/react';
import { useShallow } from 'zustand/shallow';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { TooltipIconButton } from '@/components/tooltip-icon-button';
import Image from 'next/image';
import { Backdrop, Box, Button } from '@mui/material';

const useFileSrc = (file: File | undefined) => {
	const [src, setSrc] = useState<string | undefined>(undefined);

	useEffect(() => {
		if (!file) {
			setSrc(undefined);
			return;
		}

		const objectUrl = URL.createObjectURL(file);
		setSrc(objectUrl);

		return () => {
			URL.revokeObjectURL(objectUrl);
		};
	}, [file]);

	return src;
};

const useAttachmentSrc = () => {
	const { file, src } = useAttachment(
		useShallow((a): { file?: File; src?: string } => {
			if (a.type !== 'image') return {};
			if (a.file) return { file: a.file };
			const src = a.content?.filter((c) => c.type === 'image')[0]?.image;
			if (!src) return {};
			return { src };
		})
	);

	return useFileSrc(file) ?? src;
};

const ImagePreviewDialog = ({
	...props
}: React.ComponentProps<typeof Backdrop>) => {
	const src = useAttachmentSrc();
	const [isLoaded, setIsLoaded] = useState(false);

	if (!src) return <></>;
	return (
		<Backdrop sx={{ zIndex: 10000 }} {...props}>
			<Image
				src={src}
				fill
				objectFit="contain"
				style={{
					display: isLoaded ? 'block' : 'none',
					overflow: 'clip',
					maxWidth: '100dvh',
					maxHeight: '100dvh',
					margin: 'auto',
				}}
				onLoad={() => setIsLoaded(true)}
				alt="Preview"
				loading="eager"
			/>
		</Backdrop>
	);
};

const AttachmentThumb: FC = () => {
	const isImage = useAttachment((a) => a.type === 'image');
	const src = useAttachmentSrc();
	return (
		<Avatar className="bg-muted flex size-10 items-center justify-center rounded border text-sm">
			<AvatarFallback delayMs={isImage ? 200 : 0}>
				<FileIcon />
			</AvatarFallback>
			<AvatarImage src={src} />
		</Avatar>
	);
};

const AttachmentUI: FC = () => {
	const canRemove = useAttachment((a) => a.source !== 'message');
	const typeLabel = useAttachment((a) => {
		const type = a.type;
		switch (type) {
			case 'image':
				return 'Image';
			case 'document':
				return 'Document';
			case 'file':
				return 'File';
			default:
				const _exhaustiveCheck: never = type;
				throw new Error(`Unknown attachment type: ${_exhaustiveCheck}`);
		}
	});

	const [openImagePreview, setOpenImagePreview] = useState(false);

	return (
		<Tooltip>
			<AttachmentPrimitive.Root>
				<Box position={'relative'}>
					<Button
						className="hover:bg-accent/50 cursor-pointer transition-colors"
						onClick={() => {
							if (typeLabel === 'Image') setOpenImagePreview(true);
						}}
					>
						<TooltipTrigger asChild>
							<div className="flex h-12 w-40 items-center justify-center gap-2 rounded-lg border p-1">
								<AttachmentThumb />
								<div className="flex-grow basis-0">
									<p className="text-muted-foreground line-clamp-1 text-ellipsis break-all text-xs font-bold">
										<AttachmentPrimitive.Name />
									</p>
									<p className="text-muted-foreground text-xs">{typeLabel}</p>
								</div>
							</div>
						</TooltipTrigger>
					</Button>
					{canRemove && (
						<AttachmentPrimitive.Remove asChild>
							<Box position={'absolute'} top={-5} right={-5}>
								<TooltipIconButton
									tooltip="Xóa tập tin"
									className="text-muted-foreground [&>svg]:bg-background absolute size-8 [&>svg]:size-4 [&>svg]:rounded-full"
									side="top"
								>
									<CircleXIcon />
								</TooltipIconButton>
							</Box>
						</AttachmentPrimitive.Remove>
					)}
				</Box>

				{typeLabel === 'Image' && (
					<ImagePreviewDialog
						open={openImagePreview}
						onClick={() => setOpenImagePreview(false)}
						onKeyDown={() => setOpenImagePreview(false)}
					/>
				)}
			</AttachmentPrimitive.Root>
			<TooltipContent side="top">
				<AttachmentPrimitive.Name />
			</TooltipContent>
		</Tooltip>
	);
};

export const UserMessageAttachments: FC = () => {
	return (
		<div className="flex w-full flex-row gap-3 col-span-full col-start-1 row-start-1 justify-end">
			<MessagePrimitive.Attachments components={{ Attachment: AttachmentUI }} />
		</div>
	);
};

export const ComposerAttachments: FC = () => {
	return (
		<div className="flex w-full flex-row gap-3 overflow-x-auto">
			<ComposerPrimitive.Attachments
				components={{ Attachment: AttachmentUI }}
			/>
		</div>
	);
};

export const ComposerAddAttachment: FC = () => {
	return (
		<ComposerPrimitive.AddAttachment asChild>
			<TooltipIconButton
				className="self-center my-2.5 size-8 p-2 transition-opacity ease-in"
				tooltip="Thêm đính kèm"
			>
				<PaperclipIcon />
			</TooltipIconButton>
		</ComposerPrimitive.AddAttachment>
	);
};
