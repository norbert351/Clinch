"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DealStatusBadge,
  DealTypeChip,
  WalletAddress,
  USDCAmount,
} from "@/components/clinch";
import { useWallet } from "@/components/wallet-context";
import { useContract } from "@/hooks/useContract";
import { useNetworkCheck, parseContractError } from "@/hooks/useNetworkCheck";
import { truncateAddress, formatExpiry } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";
import type { DealType } from "@/lib/types";
import { useBalance } from "wagmi";
import { USDC_ADDRESS } from "@/lib/contract";
import { getDealByOnChainId, updateDealMetadata } from "@/lib/api";

const expiryOptions = [
  { value: 1, label: "24 hours" },
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
];

export default function NewDealPage() {
  const router = useRouter();
  const { address, isConnected, hasSigned } = useWallet();
  const { createDeal, isLoading: isContractLoading } = useContract();
  const { isCorrectNetwork, switchToArc, isSwitching } = useNetworkCheck();

  const { data: usdcBalance, isLoading: isLoadingBalance } = useBalance({
    address: address as `0x${string}` | undefined,
    token: USDC_ADDRESS as `0x${string}`,
    query: {
      enabled: !!address,
      refetchInterval: 10000,
    },
  });

  const [dealType, setDealType] = useState<"MutualStake" | "OneSided">(
    "MutualStake",
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [yourDeposit, setYourDeposit] = useState("");
  const [counterpartyAddress, setCounterpartyAddress] = useState("");
  const [theirDeposit, setTheirDeposit] = useState("");
  const [expiryDays, setExpiryDays] = useState(7);
  const [isProcessing, setIsProcessing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [syncingDeal, setSyncingDeal] = useState(false);
  const [currentDealId, setCurrentDealId] = useState<number | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const isValidAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

  const counterpartyError = counterpartyAddress
    ? !isValidAddress(counterpartyAddress)
      ? "Invalid EVM address"
      : counterpartyAddress.toLowerCase() === address?.toLowerCase()
        ? "Cannot use your own address"
        : null
    : null;

  const yourDepositNum = parseFloat(yourDeposit) || 0;
  const theirDepositNum =
    dealType === "MutualStake" ? parseFloat(theirDeposit) || 0 : 0;
  const expiryDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  const formattedBalance = usdcBalance
    ? Number(usdcBalance.value) / 10 ** usdcBalance.decimals
    : 0;

  const hasEnoughBalance = formattedBalance >= yourDepositNum;

  const handleSubmit = async () => {
    setSubmitError(null);

    if (!address || !hasSigned) {
      toast.error("Please connect wallet and sign in");
      return;
    }

    if (!isCorrectNetwork) {
      await switchToArc();
      return;
    }

    if (!yourDeposit || !counterpartyAddress || counterpartyError) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!hasEnoughBalance) {
      console.warn("Submitting with insufficient balance — user was warned");
    }

    setIsProcessing(true);
    try {
      const result = await createDeal({
        partyB: counterpartyAddress,
        dealType: dealType === "MutualStake" ? "MutualStake" : "OneSided",
        partyAAmount: yourDeposit,
        partyBAmount: dealType === "MutualStake" ? theirDeposit : "0",
        expiryPeriod: expiryDays * 24 * 60 * 60,
      });

      if (result) {
        const dealId = Number(result.dealId);
        toast.success("Deal created successfully!");
        setCurrentDealId(dealId);

        if (title || description) {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

          try {
            await fetch(`${apiUrl}/api/deals/backfill/${dealId}`, {
              method: 'POST',
            });
          } catch {
          }

          const maxRetries = 10;
          const retryDelay = 1000;
          let saved = false;

          for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
              await updateDealMetadata(dealId, {
                title: title || undefined,
                description: description || undefined,
              });
              saved = true;
              break;
            } catch (metaErr: any) {
              const status = metaErr?.response?.status;
              if (status === 404) {
                await new Promise(r => setTimeout(r, retryDelay));
              } else {
                break;
              }
            }
          }

          if (!saved) {
            console.error("[NewDeal] Failed to save metadata after", maxRetries, "attempts");
            toast.error("Deal created, but title/description could not be saved");
          }
        }

        router.push(`/deals/${dealId}`);
      } else {
      }
    } catch (err) {
      console.error("[NewDealPage] Error:", err);
      const message = parseContractError(err);
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const pollForDealSync = async (dealId: number) => {
    let attempts = 0;
    const maxAttempts = 10;

    const poll = async () => {
      attempts++;
      const deal = await getDealByOnChainId(dealId);

      if (deal) {
        setSyncingDeal(false);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return;
      }

      if (attempts >= maxAttempts) {
        setSyncingDeal(false);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    };

    setSyncingDeal(true);
    pollRef.current = setInterval(poll, 2000);
  };

  useEffect(() => {
    if (currentDealId) {
      pollForDealSync(currentDealId);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [currentDealId]);

  const canSubmit =
    yourDeposit &&
    counterpartyAddress &&
    !counterpartyError &&
    isConnected &&
    hasSigned;

  return (
    <div className="px-4 pb-16 pt-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-2 text-sm text-clinch-text-tertiary transition-colors hover:text-clinch-text-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <div className="mb-8">
          <h1 className="text-h1 text-clinch-text-primary">New Agreement</h1>
          <p className="mt-1 text-sm text-clinch-text-secondary">
            Define terms and invite your counterparty
          </p>
        </div>

        {!isCorrectNetwork && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-400">
                  Wrong network
                </p>
                <p className="text-xs text-amber-500/80">
                  You are connected to the wrong network. Switch to Arc Testnet
                  to create a deal.
                </p>
              </div>
            </div>
            <button
              onClick={switchToArc}
              disabled={isSwitching}
              className="ml-4 shrink-0 rounded-md bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSwitching ? "Switching..." : "Switch to Arc Testnet"}
            </button>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr,400px]">
          <div className="rounded-xl border border-clinch-border-default bg-clinch-bg-card p-6">
            <div className="mb-6">
              <Label className="mb-2 block text-sm font-medium text-clinch-text-primary">
                Agreement type
              </Label>
              <div className="flex gap-2">
                <button
                  onClick={() => setDealType("MutualStake")}
                  className={cn(
                    "flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-all",
                    dealType === "MutualStake"
                      ? "border-clinch-accent bg-clinch-accent-muted text-clinch-text-primary"
                      : "border-clinch-border-default bg-transparent text-clinch-text-secondary hover:border-clinch-border-hover",
                  )}
                >
                  Mutual Stake
                </button>
                <button
                  onClick={() => setDealType("OneSided")}
                  className={cn(
                    "flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-all",
                    dealType === "OneSided"
                      ? "border-clinch-accent bg-clinch-accent-muted text-clinch-text-primary"
                      : "border-clinch-border-default bg-transparent text-clinch-text-secondary hover:border-clinch-border-hover",
                  )}
                >
                  One-Sided Escrow
                </button>
              </div>
              <p className="mt-2 text-xs text-clinch-text-tertiary">
                {dealType === "MutualStake"
                  ? "Both parties deposit USDC. Winner or agreed party receives all."
                  : "Only you deposit. Counterparty confirms delivery."}
              </p>
            </div>

            <div className="my-6 border-t border-clinch-border-default" />

            <div className="space-y-4">
              <div>
                <Label
                  htmlFor="title"
                  className="mb-2 block text-sm font-medium text-clinch-text-primary"
                >
                  Title{" "}
                  <span className="text-clinch-text-tertiary">(optional)</span>
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Freelance project payment"
                  className="border-clinch-border-default bg-clinch-bg-input text-clinch-text-primary placeholder:text-clinch-text-tertiary focus:border-clinch-accent focus:ring-1 focus:ring-clinch-accent/30"
                />
              </div>
              <div>
                <Label
                  htmlFor="description"
                  className="mb-2 block text-sm font-medium text-clinch-text-primary"
                >
                  Description{" "}
                  <span className="text-clinch-text-tertiary">(optional)</span>
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add context about this agreement..."
                  rows={3}
                  className="border-clinch-border-default bg-clinch-bg-input text-clinch-text-primary placeholder:text-clinch-text-tertiary focus:border-clinch-accent focus:ring-1 focus:ring-clinch-accent/30"
                />
              </div>
            </div>

            <div className="my-6 border-t border-clinch-border-default" />

            <div className="space-y-4">
              <div>
                <Label className="mb-2 block text-sm font-medium text-clinch-text-primary">
                  Your wallet
                </Label>
                <div className="rounded-lg border border-clinch-border-default bg-clinch-bg-page px-3.5 py-2.5">
                  <span className="font-mono text-sm text-clinch-text-tertiary">
                    {address ? truncateAddress(address) : "Not connected"}
                  </span>
                </div>
              </div>

              <div>
                <Label
                  htmlFor="yourDeposit"
                  className="mb-2 block text-sm font-medium text-clinch-text-primary"
                >
                  Your deposit (USDC)
                </Label>
                <div className="relative">
                  <Input
                    id="yourDeposit"
                    type="number"
                    value={yourDeposit}
                    onChange={(e) => setYourDeposit(e.target.value)}
                    placeholder="0.00"
                    className="border-clinch-border-default bg-clinch-bg-input pr-16 text-clinch-text-primary placeholder:text-clinch-text-tertiary focus:border-clinch-accent focus:ring-1 focus:ring-clinch-accent/30"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-clinch-text-tertiary">
                    USDC
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-xs text-clinch-text-tertiary">
                    Amount you will lock into the escrow contract
                  </p>
                  <div className="flex items-center gap-1.5">
                    {isLoadingBalance ? (
                      <div className="h-3 w-24 animate-pulse rounded bg-clinch-bg-elevated" />
                    ) : (
                      <>
                        <span
                          className={`text-xs font-medium ${
                            hasEnoughBalance
                              ? "text-clinch-text-tertiary"
                              : "text-clinch-danger"
                          }`}
                        >
                          Balance: {formattedBalance.toFixed(2)} USDC
                        </span>
                        {!hasEnoughBalance && yourDepositNum > 0 && (
                          <span className="text-xs text-clinch-danger">
                            (insufficient)
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {!hasEnoughBalance && yourDepositNum > 0 && (
                  <div className="mt-2 flex items-center gap-2 rounded-md border border-clinch-danger/30 bg-clinch-danger-muted px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-clinch-danger shrink-0" />
                    <p className="text-xs text-clinch-danger">
                      You need {yourDepositNum.toFixed(2)} USDC but only have{" "}
                      {formattedBalance.toFixed(2)} USDC in your wallet. You can
                      still create the agreement but the deposit step will fail.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <Label
                  htmlFor="counterparty"
                  className="mb-2 block text-sm font-medium text-clinch-text-primary"
                >
                  Counterparty wallet address
                </Label>
                <Input
                  id="counterparty"
                  value={counterpartyAddress}
                  onChange={(e) => setCounterpartyAddress(e.target.value)}
                  placeholder="0x..."
                  className={cn(
                    "border-clinch-border-default bg-clinch-bg-input font-mono text-clinch-text-primary placeholder:text-clinch-text-tertiary focus:border-clinch-accent focus:ring-1 focus:ring-clinch-accent/30",
                    counterpartyError &&
                      "border-clinch-danger focus:border-clinch-danger focus:ring-clinch-danger/20",
                  )}
                />
                {counterpartyError && (
                  <p className="mt-1 text-xs text-clinch-danger">
                    {counterpartyError}
                  </p>
                )}
              </div>

              {dealType === "MutualStake" && (
                <div>
                  <Label
                    htmlFor="theirDeposit"
                    className="mb-2 block text-sm font-medium text-clinch-text-primary"
                  >
                    Their deposit (USDC)
                  </Label>
                  <div className="relative">
                    <Input
                      id="theirDeposit"
                      type="number"
                      value={theirDeposit}
                      onChange={(e) => setTheirDeposit(e.target.value)}
                      placeholder="0.00"
                      className="border-clinch-border-default bg-clinch-bg-input pr-16 text-clinch-text-primary placeholder:text-clinch-text-tertiary focus:border-clinch-accent focus:ring-1 focus:ring-clinch-accent/30"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-clinch-text-tertiary">
                      USDC
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="my-6 border-t border-clinch-border-default" />

            <div className="space-y-4">
              <div>
                <Label className="mb-2 block text-sm font-medium text-clinch-text-primary">
                  Agreement expires in
                </Label>
                <div className="flex flex-wrap gap-2">
                  {expiryOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setExpiryDays(option.value)}
                      className={cn(
                        "rounded-lg border px-4 py-2 text-sm font-medium transition-all",
                        expiryDays === option.value
                          ? "border-clinch-accent bg-clinch-accent-muted text-clinch-text-primary"
                          : "border-clinch-border-default text-clinch-text-secondary hover:border-clinch-border-hover",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="my-6 border-t border-clinch-border-default" />

            {!isCorrectNetwork ? (
              <Button
                onClick={switchToArc}
                disabled={isSwitching}
                className="w-full bg-amber-500 py-3 text-sm font-medium text-black hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSwitching ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Switching to Arc Testnet...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Switch to Arc Testnet to Continue
                  </span>
                )}
              </Button>
            ) : isProcessing ? (
              <Button
                disabled
                className="w-full bg-clinch-accent py-3 text-sm font-medium text-white opacity-70 cursor-not-allowed"
              >
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating agreement...
                </span>
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || isProcessing}
                className="w-full bg-clinch-accent py-3 text-base font-medium text-white hover:bg-clinch-accent-hover"
              >
                Create agreement
              </Button>
            )}
            {submitError && (
              <p className="mt-2 text-center text-xs text-clinch-danger">
                {submitError}
              </p>
            )}
            <p className="mt-2 text-center text-xs text-clinch-text-tertiary">
              This will prompt a wallet transaction. No funds are deposited yet.
            </p>
          </div>

          <div className="lg:sticky lg:top-24 lg:h-fit">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-clinch-text-tertiary">
              Preview
            </div>
            <div className="rounded-xl border border-clinch-border-default bg-clinch-bg-card p-6">
              <div className="flex items-center gap-2">
                <DealStatusBadge status="Active" />
                <DealTypeChip
                  type={dealType === "MutualStake" ? "mutual" : "one-sided"}
                />
              </div>

              <h3 className="mt-4 text-[15px] font-medium text-clinch-text-primary">
                {title || (
                  <span className="text-clinch-text-tertiary">
                    Untitled deal
                  </span>
                )}
              </h3>

              <div className="my-4 border-t border-clinch-border-default" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <WalletAddress
                      address={address || "0x0000...0000"}
                      showCopy={false}
                    />
                    <div className="text-xs text-clinch-text-tertiary">
                      You (Creator)
                    </div>
                  </div>
                  <USDCAmount amount={yourDepositNum} size="sm" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    {counterpartyAddress ? (
                      <WalletAddress
                        address={counterpartyAddress}
                        showCopy={false}
                      />
                    ) : (
                      <span className="font-mono text-sm text-clinch-text-tertiary">
                        0x...
                      </span>
                    )}
                    <div className="text-xs text-clinch-text-tertiary">
                      Counterparty
                    </div>
                  </div>
                  {dealType === "MutualStake" && (
                    <USDCAmount amount={theirDepositNum} size="sm" />
                  )}
                </div>
              </div>

              <div className="my-4 border-t border-clinch-border-default" />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-clinch-text-tertiary">Arbitrator</span>
                  <span className="text-clinch-text-secondary text-xs">
                    Platform (0xdd4c…1b61)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-clinch-text-tertiary">Expires</span>
                  <span className="text-clinch-text-secondary">
                    {formatExpiry(expiryDate).text}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-clinch-text-tertiary">Fee</span>
                  <span className="text-clinch-text-secondary">2.5%</span>
                </div>
              </div>

              <p className="mt-4 text-center text-xs text-clinch-text-tertiary">
                Funds are not locked until both parties deposit
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
