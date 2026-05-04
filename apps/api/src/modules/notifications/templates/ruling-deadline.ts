import { Deal } from '../../../db/schema';

export function rulingDeadlineTemplate(deal: Partial<Deal>) {
  return {
    subject: 'Arbitration deadline approaching (24h warning)',
    html: `
      <h1>Arbitration Deadline Warning</h1>
      <p>The arbitration period for this deal will end in 24 hours.</p>
      <p><strong>Deal ID:</strong> ${deal.onChainId}</p>
      <p>Please submit your ruling before the deadline.</p>
    `,
  };
}
