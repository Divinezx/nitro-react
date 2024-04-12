import { DetailedHTMLProps, forwardRef, HTMLAttributes, PropsWithChildren } from 'react';
import { classNames } from '../common';

const classes = {
    base: 'top-2 right-2 py-0.5 px-[3px] z-[1] rounded border',
    themes: {
        'primary': 'border-black bg-red-700'
    }
}

export const NitroItemCountBadge = forwardRef<HTMLDivElement, PropsWithChildren<{
    theme?: 'primary';
    count: number;
}> & DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>>((props, ref) =>
{
    const { theme = 'primary', count = 0, className = null, children = null, ...rest } = props;

    return (
        <div
            ref={ ref }
            className={ classNames(
                classes.base,
                classes.themes[theme],
                className
            ) }
            { ...rest }>
            { count }
            { children }
        </div>
    );
});

NitroItemCountBadge.displayName = 'NitroItemCountBadge';
