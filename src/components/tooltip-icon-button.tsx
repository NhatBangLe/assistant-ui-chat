'use client';

import { ComponentPropsWithoutRef, forwardRef } from 'react';

import { IconButton, Tooltip } from '@mui/material';

export type TooltipIconButtonProps = ComponentPropsWithoutRef<
	typeof IconButton
> & {
	tooltip: string;
	side?: 'top' | 'bottom' | 'left' | 'right';
};

export const TooltipIconButton = forwardRef<
	HTMLButtonElement,
	TooltipIconButtonProps
>(({ children, tooltip, side = 'bottom', className, ...rest }, ref) => {
	return (
		<Tooltip title={tooltip} placement={side}>
			<IconButton ref={ref} className={className} {...rest}>
				{children}
			</IconButton>
		</Tooltip>
	);
});

TooltipIconButton.displayName = 'TooltipIconButton';
