import { Deal } from '../../../db/schema';

type NewMessageTemplateContext = Partial<Deal> & {
  metadata?: Record<string, unknown>;
};

function escapeHtml(value: unknown): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function newMessageTemplate(deal: NewMessageTemplateContext) {
  const dealId = deal.onChainId || 'N/A';
  const preview = escapeHtml(deal.metadata?.preview);

  return {
    subject: `New message on deal #${dealId}`,
    html: `
      <h1>New deal message</h1>
      <p>A participant sent a message on your Clinch escrow.</p>
      <p><strong>Deal ID:</strong> ${dealId}</p>
      ${preview ? `<p><strong>Preview:</strong> ${preview}</p>` : ''}
      <p>Open Clinch to review the deal communication log.</p>
    `,
  };
}
