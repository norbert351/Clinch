import { Deal } from '../../../db/schema';

export function outcomeSubmittedTemplate(deal: Partial<Deal>) {
  return {
    subject: 'Your counterparty has submitted their outcome',
    html: `
      <h1>Outcome Submitted</h1>
      <p>Your counterparty has submitted their desired outcome for this deal.</p>
      <p><strong>Deal ID:</strong> ${deal.onChainId}</p>
      <p>If you agree with their proposed outcome, you can confirm it. Otherwise, you may raise a dispute.</p>
    `,
  };
}
