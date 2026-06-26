'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { truncateAddress } from '@/lib/format';

interface WalletAddressProps {
  address: string;
  showCopy?: boolean;
  className?: string;
  truncate?: boolean;
}

export function WalletAddress({
  address,
  showCopy = true,
  className,
  truncate = true,
}: WalletAddressProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="font-mono text-sm text-text-secondary">
        {truncate ? truncateAddress(address) : address}
      </span>
      {showCopy && (
        <button
          onClick={handleCopy}
          className="flex h-5 w-5 items-center justify-center text-text-tertiary transition-colors hover:text-text-secondary"
          aria-label="Copy address"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-active" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </span>
  );
}
