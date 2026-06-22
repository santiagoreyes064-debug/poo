import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-brand-purple text-white',
        secondary: 'border-transparent bg-gray-800 text-gray-100',
        success: 'border-transparent bg-brand-green/20 text-brand-green',
        destructive: 'border-transparent bg-red-500/20 text-red-400',
        outline: 'border-gray-700 text-gray-300',
        warning: 'border-transparent bg-yellow-500/20 text-yellow-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
