import { Deal } from '../../../db/schema';

export function dealAcceptedTemplate(deal: Partial<Deal>) {
  return {
    subject: 'Your deal is now active',
    html: `
      <h1>Your deal is now active</h1>
      <p>Both parties have deposited their funds. Your deal is now active and ready to proceed.</p>
      <p><strong>Deal ID:</strong> ${deal.onChainId}</p>
      <p><strong>Type:</strong> ${deal.dealType}</p>
      <p><strong>Expiry:</strong> ${deal.expiryTimestamp}</p>
    `,
  };
}
