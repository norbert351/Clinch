import { Resend } from 'resend';
import { db } from '../../config/db';
import { notifications, users } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { config } from '../../config/env';
import { Deal } from '../../db/schema';
import * as templates from './templates';
import { emitToUser } from '../../socket/gateway';

type NotificationType =
  | 'deal-invite'
  | 'deal-accepted'
  | 'outcome-submitted'
  | 'dispute-opened'
  | 'dispute-resolved'
  | 'ruling-deadline'
  | 'deal-settled'
  | 'deal-expired'
  | 'new-message'
  | 'arbitrator-notification';

const PLATFORM_ARBITRATOR = config.admin.arbitrator;
const resendClient = config.email.apiKey ? new Resend(config.email.apiKey) : null;

type NotificationContext = Partial<Deal> & {
  metadata?: Record<string, unknown>;
};

interface NotificationPayload {
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

function getNotificationPayload(type: NotificationType, dealContext?: NotificationContext): NotificationPayload {
  const payloads: Record<NotificationType, NotificationPayload> = {
    'deal-invite': {
      title: 'You\'ve been invited to a deal',
      message: 'A new deal has been created and you\'ve been invited as the counterparty.',
      metadata: { onChainId: dealContext?.onChainId },
    },
    'deal-accepted': {
      title: 'Deal is now active',
      message: 'Both parties have deposited. Your deal is now active and awaiting completion.',
      metadata: { onChainId: dealContext?.onChainId },
    },
    'outcome-submitted': {
      title: 'Outcome submitted',
      message: 'The other party has submitted their outcome. Please confirm or dispute.',
      metadata: { onChainId: dealContext?.onChainId },
    },
    'dispute-opened': {
      title: 'Dispute opened',
      message: 'A dispute has been raised on your deal. The arbitrator will review.',
      metadata: { onChainId: dealContext?.onChainId },
    },
    'dispute-resolved': {
      title: 'Dispute resolved',
      message: 'Your dispute has been resolved. Payout has been executed.',
      metadata: { onChainId: dealContext?.onChainId },
    },
    'ruling-deadline': {
      title: 'Arbitration deadline approaching',
      message: 'The ruling deadline for your disputed deal is approaching.',
      metadata: { onChainId: dealContext?.onChainId },
    },
    'deal-settled': {
      title: 'Deal settled',
      message: 'Your deal has been resolved and payout has been executed.',
      metadata: { onChainId: dealContext?.onChainId },
    },
    'deal-expired': {
      title: 'Deal expired',
      message: 'Your deal has expired without completion.',
      metadata: { onChainId: dealContext?.onChainId },
    },
    'new-message': {
      title: 'New deal message',
      message: 'A participant sent a message on your deal.',
      metadata: {
        onChainId: dealContext?.onChainId,
        href: `/deals/${dealContext?.onChainId}`,
        ...(dealContext?.metadata || {}),
      },
    },
    'arbitrator-notification': {
      title: 'New dispute to resolve',
      message: 'A dispute requires your arbitration. Please review and make a ruling.',
      metadata: { onChainId: dealContext?.onChainId },
    },
  };
  return payloads[type] || { title: 'Deal update', message: 'There is an update on your deal.' };
}

async function getUserByWallet(walletAddress: string): Promise<typeof users.$inferSelect | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.walletAddress, walletAddress.toLowerCase()),
  });
  if (!user) return null;
  return user;
}

const templateMap: Partial<Record<NotificationType, (deal: NotificationContext) => { subject: string; html: string }>> = {
  'deal-invite': templates.dealInviteTemplate,
  'deal-accepted': templates.dealAcceptedTemplate,
  'outcome-submitted': templates.outcomeSubmittedTemplate,
  'dispute-opened': templates.disputeOpenedTemplate,
  'dispute-resolved': templates.disputeResolvedTemplate,
  'ruling-deadline': templates.rulingDeadlineTemplate,
  'deal-settled': templates.dealSettledTemplate,
  'deal-expired': templates.dealExpiredTemplate,
  'new-message': templates.newMessageTemplate,
  'arbitrator-notification': templates.disputeOpenedTemplate,
};

export async function sendNotification(
  type: NotificationType,
  walletAddress: string,
  dealContext?: NotificationContext
): Promise<void> {
  try {
    const payload = getNotificationPayload(type, dealContext);
    const user = await getUserByWallet(walletAddress);
    const email = user?.email || null;
    const emailEnabled = user?.emailNotifications !== false;

    // Email (if enabled)
    if (email && emailEnabled && resendClient) {
      const templateFn = templateMap[type];
      if (templateFn) {
        const { subject, html } = templateFn(dealContext || {});
        const { error } = await resendClient.emails.send({
          from: config.email.from,
          to: email,
          subject,
          html,
        });
        if (error) {
          console.error('[Notification] Failed to send email:', error);
        }
      }
    }

    const [inserted] = await db.insert(notifications).values({
      walletAddress: walletAddress.toLowerCase(),
      onChainId: dealContext?.onChainId ? Number(dealContext.onChainId) : null,
      type,
      title: payload.title,
      message: payload.message,
      metadata: payload.metadata,
      read: false,
    }).returning();

    // Emit realtime
    try {
      emitToUser(walletAddress.toLowerCase(), 'notification:new', {
        id: inserted?.id,
        type,
        title: payload.title,
        message: payload.message,
        metadata: payload.metadata,
        onChainId: dealContext?.onChainId,
        read: false,
        sentAt: new Date().toISOString(),
      });
    } catch (socketErr) {
      console.warn('[Notification] Socket emit failed:', socketErr);
    }
  } catch (err) {
    console.error('[Notification] Error sending notification:', err);
  }
}

export async function notifyArbitrator(
  type: NotificationType,
  dealContext?: Partial<Deal>
): Promise<void> {
  if (!PLATFORM_ARBITRATOR) {
    console.warn('[Notification] PLATFORM_ARBITRATOR is not configured');
    return;
  }
  await sendNotification(type, PLATFORM_ARBITRATOR, dealContext);
}

export async function sendBulkNotifications(
  type: NotificationType,
  walletAddresses: string[],
  dealContext?: Partial<Deal>
): Promise<void> {
  await Promise.all(
    walletAddresses.map((wallet) =>
      sendNotification(type, wallet, dealContext).catch((err) =>
        console.error(`Failed to send ${type} to ${wallet}:`, err)
      )
    )
  );
}
