import { Deal } from '../../../db/schema';

export function disputeOpenedTemplate(deal: Partial<Deal>) {
  return {
    subject: 'A dispute has been raised — ruling required',
    html: `
      <h1>Dispute Opened</h1>
      <p>A dispute has been raised on one of your deals and requires arbitration.</p>
      <p><strong>Deal ID:</strong> ${deal.onChainId}</p>
      <p>Please review and provide a ruling.</p>
    `,
  };
}
