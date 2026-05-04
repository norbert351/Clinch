import { Deal } from '../../../db/schema';

export function dealSettledTemplate(deal: Partial<Deal>) {
  return {
    subject: 'Your deal has been settled',
    html: `
      <h1>Deal Settled</h1>
      <p>Your deal has been completed and funds have been distributed.</p>
      <p><strong>Deal ID:</strong> ${deal.onChainId}</p>
      <p><strong>Final Outcome:</strong> ${deal.status}</p>
    `,
  };
}
