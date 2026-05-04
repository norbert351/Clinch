import { db } from '../../config/db';
import { disputes, deals } from '../../db/schema';
import { eq, isNull, and, or, desc, sql } from 'drizzle-orm';

const PLATFORM_ARBITRATOR = '0xdd4c983Cd57Ee7A6F8Ef0BbB8715B19bdF5C1b61';

export async function getDisputesForArbitrator(
  arbitratorWallet: string
): Promise<any[]> {
  console.log('[getDisputesForArbitrator] wallet:', arbitratorWallet);
  
  const walletLower = arbitratorWallet.toLowerCase();
  const isPlatformArbitrator = walletLower === PLATFORM_ARBITRATOR.toLowerCase();
  
  // Get all disputed deals
  const allDisputedDeals = await db
    .select()
    .from(deals)
    .where(eq(deals.status, 'Disputed'))
    .orderBy(desc(deals.updatedAt));

  console.log('[getDisputesForArbitrator] Found disputed deals:', allDisputedDeals.length);

  // Filter by arbitrator matching wallet or platform arbitrator for null/missing
  const relevantDeals = allDisputedDeals.filter(deal => {
    const dealArb = deal.arbitratorWallet?.toLowerCase() || '';
    if (dealArb === walletLower) return true;
    if (isPlatformArbitrator && (!dealArb || dealArb === '0x0000000000000000000000000000000000000000' || dealArb === '')) return true;
    return false;
  });

  console.log('[getDisputesForArbitrator] Filtered to:', relevantDeals.length, 'deals for this arbitrator');

  // For each disputed deal, get or create a dispute record
  const results: any[] = [];
  
  for (const deal of relevantDeals) {
    let dispute = await db.query.disputes.findFirst({
      where: eq(disputes.onChainId, deal.onChainId),
    });
    
    if (!dispute) {
      // Dispute record missing — create it from the deal data
      const [created] = await db.insert(disputes).values({
        onChainId: deal.onChainId,
        raisedBy: deal.partyA,
        reasonText: 'Vote mismatch — awaiting arbitration',
      }).returning();
      
      if (created) {
        dispute = created;
      }
    }
    
    if (dispute) {
      results.push({ ...dispute, deal });
    }
  }

  console.log('[getDisputesForArbitrator] Returning:', results.length, 'disputes with deal data');
  return results;
}

export async function getDisputeByOnChainId(onChainId: bigint): Promise<any | null> {
  const dispute = await db.query.disputes.findFirst({
    where: eq(disputes.onChainId, Number(onChainId)),
  });
  return dispute || null;
}

export async function createDispute(
  onChainId: bigint,
  raisedBy: string,
  reasonText?: string
): Promise<any> {
  const [dispute] = await db
    .insert(disputes)
    .values({
      onChainId: Number(onChainId),
      raisedBy: raisedBy.toLowerCase(),
      reasonText,
    })
    .returning();

  return dispute;
}

export async function updateDisputeRuling(
  onChainId: bigint,
  ruling: string,
  ruledByWallet: string
): Promise<any | null> {
  const [updated] = await db
    .update(disputes)
    .set({
      ruling,
      ruledByWallet: ruledByWallet.toLowerCase(),
      ruledAt: new Date(),
    })
    .where(eq(disputes.onChainId, Number(onChainId)))
    .returning();

  return updated || null;
}