import { Deal } from '../../../db/schema';

export function dealExpiredTemplate(deal: Partial<Deal>) {
  return {
    subject: 'Your deal has expired — funds returned',
    html: `
      <h1>Deal Expired</h1>
      <p>Your deal has expired and funds have been returned to both parties.</p>
      <p><strong>Deal ID:</strong> ${deal.onChainId}</p>
    `,
  };
}
