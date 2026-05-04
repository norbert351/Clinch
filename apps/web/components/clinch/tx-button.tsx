'use client';

import { Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type TxState = 'idle' | 'pending' | 'confirming' | 'success' | 'error';

interface TxButtonProps extends React.ComponentProps<'button'> {
  state: TxState;
  idleText: string;
  pendingText?: string;
  confirmingText?: string;
  successText?: string;
  errorText?: string;
  onRetry?: () => void;
}

export function TxButton({
  state,
  idleText,
  pendingText = 'Waiting for wallet...',
  confirmingText = 'Confirming...',
  successText = 'Success',
  errorText = 'Failed',
  onRetry,
  className,
  disabled,
  ...props
}: TxButtonProps) {
  const isLoading = state === 'pending' || state === 'confirming';
  const isSuccess = state === 'success';
  const isError = state === 'error';

  return (
    <div className="space-y-2">
      <Button
        className={cn(
          'w-full transition-all',
          isSuccess && 'border-clinch-success bg-clinch-success-muted text-clinch-success hover:bg-clinch-success-muted',
          isError && 'border-clinch-danger bg-clinch-danger-muted text-clinch-danger hover:bg-clinch-danger-muted',
          className
        )}
        disabled={disabled || isLoading || isSuccess}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isSuccess && <Check className="mr-2 h-4 w-4" />}
        {isError && <AlertCircle className="mr-2 h-4 w-4" />}
        
        {state === 'idle' && idleText}
        {state === 'pending' && pendingText}
        {state === 'confirming' && confirmingText}
        {state === 'success' && successText}
        {state === 'error' && errorText}
      </Button>
      
      {isError && onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="w-full text-clinch-text-secondary hover:text-clinch-text-primary"
        >
          Try again
        </Button>
      )}
    </div>
  );
}
