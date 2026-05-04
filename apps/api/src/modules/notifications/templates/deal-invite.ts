import { Deal } from '../../../db/schema';

export function dealInviteTemplate(deal: Partial<Deal>) {
  return {
    subject: "You've been invited to a Clinch deal",
    html: `
      <h1>You've been invited to a Clinch deal</h1>
      <p>You've been invited to participate in a deal escrow on Clinch.</p>
      <p><strong>Deal Details:</strong></p>
      <ul>
        <li>Deal ID: ${deal.onChainId}</li>
        <li>Type: ${deal.dealType}</li>
        <li>Amount: ${deal.amountA} / ${deal.amountB}</li>
      </ul>
      <p>Visit Clinch to view and accept this deal.</p>
    `,
  };
}
