// Truncate wallet address: 0x1234...5678
export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Truncate transaction hash: 0xabcdef1234...
export function truncateTxHash(hash: string): string {
  if (!hash || hash.length < 14) return hash;
  return `${hash.slice(0, 12)}...`;
}

// Format USDC amount with 2 decimals and thousand separators
export function formatUSDC(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Format relative time (e.g., "2 days ago", "in 5 hours")
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const isFuture = diffMs > 0;
  const absDays = Math.abs(diffDays);
  const absHours = Math.abs(diffHours) % 24;
  const absMins = Math.abs(diffMins) % 60;

  if (absDays > 0) {
    if (absHours > 0) {
      return isFuture ? `in ${absDays}d ${absHours}h` : `${absDays}d ${absHours}h ago`;
    }
    return isFuture ? `in ${absDays}d` : `${absDays}d ago`;
  }

  if (Math.abs(diffHours) > 0) {
    if (absMins > 0) {
      return isFuture ? `in ${Math.abs(diffHours)}h ${absMins}m` : `${Math.abs(diffHours)}h ${absMins}m ago`;
    }
    return isFuture ? `in ${Math.abs(diffHours)}h` : `${Math.abs(diffHours)}h ago`;
  }

  if (absMins > 0) {
    return isFuture ? `in ${absMins}m` : `${absMins}m ago`;
  }

  return isFuture ? 'in a moment' : 'just now';
}

// Format countdown for expiry (e.g., "3d 4h" or "Expired")
export function formatExpiry(date: Date): { text: string; isExpired: boolean } {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  
  if (diffMs <= 0) {
    return { text: 'Expired', isExpired: true };
  }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (diffDays > 0) {
    return { text: `Expires in ${diffDays}d ${diffHours}h`, isExpired: false };
  }

  if (diffHours > 0) {
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return { text: `Expires in ${diffHours}h ${diffMins}m`, isExpired: false };
  }

  const diffMins = Math.floor(diffMs / (1000 * 60));
  return { text: `Expires in ${diffMins}m`, isExpired: false };
}

// Format date (e.g., "Jan 15, 2024")
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Format date and time (e.g., "Jan 15, 2024 at 2:30 PM")
export function formatDateTime(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Format relative time past (e.g., "2m ago", "3h ago", "5d ago")
export function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return 'just now';
}
