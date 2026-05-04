import { Request, Response, NextFunction } from 'express';
import {
  getDeals,
  getDealByOnChainId,
  getDealByInviteToken,
  updateDealMetadata,
  generateInviteToken,
} from './deals.service';
import { successResponse, errorResponse } from '../../middleware/error.middleware';
import { publicClient, CONTRACT_ABI, config } from '../../blockchain/contract';
import { db } from '../../config/db';
import { deals } from '../../db/schema';
import { eq, or, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function getDealsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
    const status = req.query.status as string | undefined;
    const wallet = req.wallet as string | undefined;

    const result = await getDeals(page, pageSize, status, wallet);
    res.json(successResponse(result));
  } catch (err) {
    next(err);
  }
}

export async function getDealByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { onChainId } = req.params;
    const onChainIdStr = Array.isArray(onChainId) ? onChainId[0] : onChainId;
    const onChainIdNum = parseInt(onChainIdStr);

    if (isNaN(onChainIdNum)) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    const deal = await getDealByOnChainId(BigInt(onChainIdNum));

    if (!deal) {
      res.status(404).json(errorResponse('Deal not found'));
      return;
    }

    res.json(successResponse(deal));
  } catch (err) {
    next(err);
  }
}

export async function getDealByInviteTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token } = req.params;
    const tokenStr = Array.isArray(token) ? token[0] : token;
    const deal = await getDealByInviteToken(tokenStr);

    if (!deal) {
      res.status(404).json(errorResponse('Invalid invite link'));
      return;
    }

    res.json(successResponse({
      onChainId: deal.onChainId,
      partyA: deal.partyA,
      partyB: deal.partyB,
      dealType: deal.dealType,
      amountA: deal.amountA,
      amountB: deal.amountB,
      title: deal.title,
      description: deal.description,
      status: deal.status,
    }));
  } catch (err) {
    next(err);
  }
}

export async function getUserDealsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { address } = req.params;
    const addressStr = Array.isArray(address) ? address[0] : address;

    const userDeals = await db
      .select()
      .from(deals)
      .where(
        or(
          sql`lower(${deals.partyA}) = ${addressStr.toLowerCase()}`,
          sql`lower(${deals.partyB}) = ${addressStr.toLowerCase()}`
        )
      )
      .orderBy(desc(deals.createdAt));

    res.json(successResponse(userDeals));
  } catch (err) {
    next(err);
  }
}

export async function updateMetadataHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const wallet = req.wallet!;
    const { onChainId, title, description, inviteToken } = req.body as {
      onChainId: number;
      title?: string;
      description?: string;
      inviteToken?: string;
    };

    let deal = await getDealByOnChainId(BigInt(onChainId));

    if (!deal) {
      try {
        const dealData = await publicClient.readContract({
          address: config.blockchain.contractAddress as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'getDeal',
          args: [BigInt(onChainId)],
        });

        const [partyA, partyB, dealType, status, partyAAmount, partyBAmount, , , feePercent, arbitrator, createdAt] =
          dealData as unknown as any[];

        const expiryTimestamp = await publicClient.readContract({
          address: config.blockchain.contractAddress as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'getDealExpiry',
          args: [BigInt(onChainId)],
        }) as bigint;

        const dealTypeString = Number(dealType) === 1 ? 'OneSided' : 'MutualStake';
        const amountA = (Number(partyAAmount) / 1e6).toString();
        const amountB = (Number(partyBAmount) / 1e6).toString();
        const feeStr = (Number(feePercent) / 100).toString();
        const statusMap: Record<number, string> = {
          0: 'Active', 1: 'Confirmed', 2: 'Disputed', 3: 'Resolved', 4: 'Cancelled', 5: 'Expired',
        };

        const [depositsDataA, depositsDataB] = await Promise.allSettled([
          publicClient.readContract({
            address: config.blockchain.contractAddress as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'hasDeposited',
            args: [BigInt(onChainId), partyA],
          }),
          publicClient.readContract({
            address: config.blockchain.contractAddress as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'hasDeposited',
            args: [BigInt(onChainId), partyB],
          }),
        ]);

        const partyADep = depositsDataA.status === 'fulfilled' ? Boolean(depositsDataA.value) : false;
        const partyBdep = depositsDataB.status === 'fulfilled' ? Boolean(depositsDataB.value) : false;

        await db.insert(deals).values({
          onChainId,
          partyA: (partyA as string).toLowerCase(),
          partyB: (partyB as string).toLowerCase(),
          dealType: dealTypeString,
          status: statusMap[Number(status)] || 'Active',
          amountA,
          amountB,
          arbitratorWallet: arbitrator,
          feePercent: feeStr,
          expiryTimestamp: new Date(Number(expiryTimestamp) * 1000),
          inviteToken: generateInviteToken(),
          partyADepositComplete: partyADep,
          partyBDepositComplete: partyBdep,
        }).onConflictDoUpdate({
          target: deals.onChainId,
          set: { status: statusMap[Number(status)] || 'Active', updatedAt: new Date() },
        });

        deal = await getDealByOnChainId(BigInt(onChainId));
      } catch (backfillErr) {
        console.error('[updateMetadataHandler] Backfill failed:', backfillErr);
      }
    }

    if (!deal) {
      res.status(404).json(errorResponse('Deal not found'));
      return;
    }

    if (deal.partyA.toLowerCase() !== wallet.toLowerCase() &&
        deal.partyB.toLowerCase() !== wallet.toLowerCase()) {
      res.status(403).json(errorResponse('Not authorized to update this deal'));
      return;
    }

    const finalInviteToken = inviteToken ?? (deal.inviteToken || generateInviteToken());
    const updated = await updateDealMetadata(BigInt(onChainId), { title, description, inviteToken: finalInviteToken });

    res.json(successResponse(updated));
  } catch (err) {
    next(err);
  }
}

export async function backfillDealHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { onChainId } = req.params;
  const onChainIdStr = Array.isArray(onChainId) ? onChainId[0] : onChainId;
  const onChainIdNum = parseInt(onChainIdStr);

  console.log('[Backfill] Starting backfill for deal:', onChainIdNum);

  try {
    if (isNaN(onChainIdNum)) {
      res.status(400).json(errorResponse('Invalid onChainId'));
      return;
    }

    console.log('[Backfill] Fetching deal from chain:', onChainIdNum);

    const dealData = await publicClient.readContract({
      address: config.blockchain.contractAddress as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'getDeal',
      args: [BigInt(onChainIdNum)],
    });

    console.log('[Backfill] Raw deal from chain:', dealData);

    const [
      partyA, partyB, dealType, status,
      partyAAmount, partyBAmount,
      , ,
      feePercent, arbitrator, createdAt
    ] = dealData as unknown as any[];

    const expiryTimestamp = await publicClient.readContract({
      address: config.blockchain.contractAddress as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'getDealExpiry',
      args: [BigInt(onChainIdNum)],
    }) as bigint;

    const inviteToken = nanoid(12);
    const dealTypeString = Number(dealType) === 1 ? 'OneSided' : 'MutualStake';

    const amountA = (Number(partyAAmount) / 1e6).toString();
    const amountB = (Number(partyBAmount) / 1e6).toString();
    const feeStr = (Number(feePercent) / 100).toString();

    const statusMap: Record<number, string> = {
      0: 'Active',
      1: 'Confirmed',
      2: 'Disputed',
      3: 'Resolved',
      4: 'Cancelled',
      5: 'Expired',
    };

    const [depositsDataA, depositsDataB] = await Promise.allSettled([
      publicClient.readContract({
        address: config.blockchain.contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'hasDeposited',
        args: [BigInt(onChainIdNum), partyA],
      }),
      publicClient.readContract({
        address: config.blockchain.contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'hasDeposited',
        args: [BigInt(onChainIdNum), partyB],
      }),
    ]);

    const partyADep = depositsDataA.status === 'fulfilled' ? Boolean(depositsDataA.value) : false;
    const partyBdep = depositsDataB.status === 'fulfilled' ? Boolean(depositsDataB.value) : false;

    console.log('[Backfill] Writing to database...');
    const [savedDeal] = await db.insert(deals).values({
      onChainId: onChainIdNum,
      partyA: (partyA as string).toLowerCase(),
      partyB: (partyB as string).toLowerCase(),
      dealType: dealTypeString,
      status: statusMap[Number(status)] || 'Active',
      amountA,
      amountB,
      arbitratorWallet: arbitrator,
      feePercent: feeStr,
      expiryTimestamp: new Date(Number(expiryTimestamp) * 1000),
      inviteToken,
      partyADepositComplete: partyADep,
      partyBDepositComplete: partyBdep,
    }).onConflictDoUpdate({
      target: deals.onChainId,
      set: {
        status: statusMap[Number(status)] || 'Active',
        updatedAt: new Date(),
        partyADepositComplete: partyADep,
        partyBDepositComplete: partyBdep,
      },
    }).returning();

    console.log('[Backfill] Deal saved successfully:', savedDeal?.id);
    res.json(successResponse(savedDeal));
  } catch (error: any) {
    console.error('[Backfill] Failed:', error?.message || error);
    res.status(500).json(errorResponse(error?.message || 'Backfill failed'));
  }
}
