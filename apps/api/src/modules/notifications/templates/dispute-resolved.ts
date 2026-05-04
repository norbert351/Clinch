import { Deal } from '../../../db/schema';

export function disputeResolvedTemplate(deal: Partial<Deal>): { subject: string; html: string } {
  const dealId = deal.onChainId || 'N/A';
  const title = deal.title || 'Untitled Deal';
  const ruling = deal.winner || 'Split';

  return {
    subject: `Dispute Resolved - Deal #${dealId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">Dispute Resolved</h2>
        <p>Deal <strong>#${dealId}</strong> - "${title}" has been resolved.</p>
        <p><strong>Outcome:</strong> ${ruling}</p>
        <p style="color: #666; font-size: 14px;">
          The arbitrator has made a ruling and funds have been distributed accordingly.
        </p>
      </div>
    `,
  };
}