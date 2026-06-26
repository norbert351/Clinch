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
  GatewayFundingModal,
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
import { API_URL, getDealByOnChainId, updateDealMetadata } from "@/lib/api";
import { useUnifiedBalance } from "@/hooks/useUnifiedBalance";

const expiryOptions = [
  { value: 1, label: "24 hours" },
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
];

export default function NewDealPage() {
  const router = useRouter();
  const {
    address,
    isConnected,
    hasSigned,
    isWalletClientReady: contextWalletReady,
    isWalletClientLoading,
  } = useWallet();
  const {
    createDeal,
    isLoading: isContractLoading,
    isWalletReady: contractWalletReady,
    isWalletClientLoading: contractWalletLoading,
  } = useContract();
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
  const [fundingOpen, setFundingOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [syncingDeal, setSyncingDeal] = useState(false);
  const [currentDealId, setCurrentDealId] = useState<number | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const submitLockRef = useRef(false);

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
  const { data: unifiedBalance, isLoading: isLoadingUnifiedBalance } = useUnifiedBalance(
    !!address && hasSigned,
    address,
  );
  const unifiedBalanceAmount = unifiedBalance?.totalBalance ?? null;

  const hasEnoughBalance = formattedBalance >= yourDepositNum;
  const hasEnoughUnifiedBalance =
    unifiedBalanceAmount !== null && unifiedBalanceAmount >= yourDepositNum;
  const isWalletReady =
    Boolean(address) &&
    Boolean(contextWalletReady) &&
    Boolean(contractWalletReady);
  const walletInitializing =
    Boolean(address) &&
    !isWalletReady &&
    (isWalletClientLoading || contractWalletLoading || isConnected);
  const isSubmitting = isProcessing || isContractLoading;

  const handleSubmit = async () => {
    setSubmitError(null);

    if (submitLockRef.current || isSubmitting) return;
    submitLockRef.current = true;

    if (!address || !hasSigned) {
      toast.error("Please connect wallet and sign in");
      submitLockRef.current = false;
      return;
    }

    if (!isWalletReady) {
      setSubmitError("Wallet still initializing");
      toast.error("Wallet still initializing");
      submitLockRef.current = false;
      return;
    }

    if (!isCorrectNetwork) {
      await switchToArc();
      submitLockRef.current = false;
      return;
    }

    if (!yourDeposit || !counterpartyAddress || counterpartyError) {
      toast.error("Please fill in all required fields");
      submitLockRef.current = false;
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
          try {
            await fetch(`${API_URL}/api/deals/backfill/${dealId}`, {
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
        setSubmitError("Wallet transaction was not submitted");
      }
    } catch (err) {
      console.error("[NewDealPage] Error:", err);
      const message = parseContractError(err);
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsProcessing(false);
      submitLockRef.current = false;
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
    Boolean(yourDeposit) &&
    Boolean(counterpartyAddress) &&
    !counterpartyError &&
    isConnected &&
    hasSigned &&
    isWalletReady &&
    !isSubmitting &&
    !submitLockRef.current;

  return (
    <div className="px-4 pb-16 pt-8 md:px-8">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-2 text-sm text-text-tertiary transition-colors hover:text-text-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <div className="mb-8">
          <div className="font-sans text-[11px] uppercase tracking-[0.12em] text-text-tertiary">
            Agreement desk
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-text-primary">New Agreement</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Define terms and invite your counterparty
          </p>
        </div>

        {!isCorrectNetwork && (
          <div className="mb-6 flex items-center justify-between border border-pending/40 bg-elevated px-4 py-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-pending shrink-0" />
              <div>
                <p className="text-sm font-medium text-pending">
                  Wrong network
                </p>
                <p className="text-xs text-text-secondary">
                  You are connected to the wrong network. Switch to Arc Testnet
                  to create a deal.
                </p>
              </div>
            </div>
            <button
              onClick={switchToArc}
              disabled={isSwitching}
              className="btn-sharp ml-4 shrink-0 border border-pending/40 px-3 py-1.5 text-xs font-medium text-pending hover:bg-pending/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSwitching ? "Switching..." : "Switch to Arc Testnet"}
            </button>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
          <div className="border border-border-subtle bg-surface p-6">
            <div className="relative mb-6 grid gap-4 md:grid-cols-[56px_1fr]">
              <div className="font-mono text-[48px] leading-none text-text-tertiary/20">01</div>
              <div>
              <Label className="mb-3 block font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary">
                Agreement type
              </Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => setDealType("MutualStake")}
                  className={cn(
                    "border border-border-subtle border-l-[3px] border-l-usdc px-4 py-4 text-left transition-all",
                    dealType === "MutualStake"
                      ? "border-usdc bg-elevated text-text-primary"
                      : "bg-transparent text-text-secondary opacity-60 hover:border-border-default",
                  )}
                >
                  <span className="block text-sm font-semibold text-text-primary">Mutual Stake</span>
                  <span className="mt-1 block text-xs leading-5 text-text-secondary">
                    Both parties deposit USDC. Winner receives the locked stake.
                  </span>
                </button>
                <button
                  onClick={() => setDealType("OneSided")}
                  className={cn(
                    "border border-border-subtle border-l-[3px] border-l-cyan px-4 py-4 text-left transition-all",
                    dealType === "OneSided"
                      ? "border-usdc bg-elevated text-text-primary"
                      : "bg-transparent text-text-secondary opacity-60 hover:border-border-default",
                  )}
                >
                  <span className="block text-sm font-semibold text-text-primary">One-Sided Escrow</span>
                  <span className="mt-1 block text-xs leading-5 text-text-secondary">
                    Client funds the payment. Worker receives it after confirmation.
                  </span>
                </button>
              </div>
              <p className="mt-3 text-xs text-text-tertiary">
                {dealType === "MutualStake"
                  ? "Both parties deposit USDC. Winner or agreed party receives all."
                  : "Only you deposit. Counterparty confirms delivery."}
              </p>
              </div>
            </div>

            <div className="rule-gradient my-8" />

            <div className="relative grid gap-4 md:grid-cols-[56px_1fr]">
              <div className="font-mono text-[48px] leading-none text-text-tertiary/20">02</div>
              <div className="space-y-4">
              <div>
                <Label
                  htmlFor="title"
                  className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary"
                >
                  Title{" "}
                  <span className="text-text-tertiary">(optional)</span>
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Freelance project payment"
                  className="rounded-none border border-border-subtle bg-elevated font-sans text-text-primary placeholder:text-text-tertiary focus:border-usdc focus:ring-0"
                />
              </div>
              <div>
                <Label
                  htmlFor="description"
                  className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary"
                >
                  Description{" "}
                  <span className="text-text-tertiary">(optional)</span>
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add context about this agreement..."
                  rows={3}
                  className="rounded-none border border-border-subtle bg-elevated font-sans text-text-primary placeholder:text-text-tertiary focus:border-usdc focus:ring-0"
                />
              </div>
              </div>
            </div>

            <div className="rule-gradient my-8" />

            <div className="relative grid gap-4 md:grid-cols-[56px_1fr]">
              <div className="font-mono text-[48px] leading-none text-text-tertiary/20">03</div>
              <div className="space-y-4">
              <div>
                <Label className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary">
                  Your wallet
                </Label>
                <div className="border border-border-subtle bg-void px-3.5 py-2.5">
                  <span className="font-mono text-sm text-text-tertiary">
                    {address ? truncateAddress(address) : "Not connected"}
                  </span>
                </div>
              </div>

              <div>
                <Label
                  htmlFor="yourDeposit"
                  className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary"
                >
                  Your deposit
                </Label>
                <div className="relative">
                  <Input
                    id="yourDeposit"
                    type="number"
                    value={yourDeposit}
                    onChange={(e) => setYourDeposit(e.target.value)}
                    placeholder="0.00"
                    className="h-14 rounded-none border border-border-subtle bg-elevated pr-20 font-mono text-[32px] text-text-primary placeholder:text-text-tertiary focus:border-usdc focus:ring-0"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-text-secondary">
                    USDC
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-xs text-text-tertiary">
                    ≈ ${yourDepositNum.toFixed(2)} USD
                  </p>
                  <div className="flex items-center gap-1.5">
                    {isLoadingBalance ? (
                      <div className="h-3 w-24 animate-pulse bg-elevated" />
                    ) : (
                      <>
                        <span
                          className={`text-xs font-medium ${
                            hasEnoughBalance
                              ? "text-text-tertiary"
                              : "text-dispute"
                          }`}
                        >
                          Balance: {formattedBalance.toFixed(2)} USDC
                        </span>
                        {!hasEnoughBalance && yourDepositNum > 0 && (
                          <span className="text-xs text-dispute">
                            (insufficient)
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-2 border border-border-subtle bg-void px-3 py-2">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-text-tertiary">
                      Unified USDC balance
                    </span>
                    {isLoadingUnifiedBalance ? (
                      <span className="h-3 w-24 animate-pulse bg-elevated" />
                    ) : unifiedBalanceAmount === null ? (
                      <span className="text-text-secondary">Syncing</span>
                    ) : (
                      <span
                        className={cn(
                          'font-medium tabular-nums',
                          hasEnoughUnifiedBalance
                            ? 'text-text-primary'
                            : 'text-pending',
                        )}
                      >
                        {unifiedBalanceAmount.toFixed(2)} USDC
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFundingOpen(true)}
                    className="mt-1 text-xs font-medium text-usdc hover:text-arc"
                  >
                    Add USDC from supported testnets
                  </button>
                </div>
                {!hasEnoughBalance && yourDepositNum > 0 && (
                  <div className="mt-2 flex items-center gap-2 border border-dispute/30 bg-dispute/10 px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-dispute shrink-0" />
                    <p className="text-xs text-dispute">
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
                  className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary"
                >
                  Counterparty wallet address
                </Label>
                <Input
                  id="counterparty"
                  value={counterpartyAddress}
                  onChange={(e) => setCounterpartyAddress(e.target.value)}
                  placeholder="0x..."
                  className={cn(
                    "rounded-none border border-border-subtle bg-elevated font-mono text-text-primary placeholder:text-text-tertiary focus:border-usdc focus:ring-0",
                    counterpartyError &&
                      "border-dispute focus:border-dispute focus:ring-dispute/20",
                  )}
                />
                {counterpartyError && (
                  <p className="mt-1 text-xs text-dispute">
                    {counterpartyError}
                  </p>
                )}
              </div>

              {dealType === "MutualStake" && (
                <div>
                  <Label
                    htmlFor="theirDeposit"
                    className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary"
                  >
                    Their deposit
                  </Label>
                  <div className="relative">
                    <Input
                      id="theirDeposit"
                      type="number"
                      value={theirDeposit}
                      onChange={(e) => setTheirDeposit(e.target.value)}
                      placeholder="0.00"
                      className="h-14 rounded-none border border-border-subtle bg-elevated pr-20 font-mono text-[32px] text-text-primary placeholder:text-text-tertiary focus:border-usdc focus:ring-0"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-text-secondary">
                      USDC
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-text-tertiary">
                    ≈ ${theirDepositNum.toFixed(2)} USD
                  </p>
                </div>
              )}
              </div>
            </div>

            <div className="rule-gradient my-8" />

            <div className="relative grid gap-4 md:grid-cols-[56px_1fr]">
              <div className="font-mono text-[48px] leading-none text-text-tertiary/20">04</div>
              <div className="space-y-4">
              <div>
                <Label className="mb-3 block font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary">
                  Agreement expires in
                </Label>
                <div className="flex flex-wrap gap-2">
                  {expiryOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setExpiryDays(option.value)}
                      className={cn(
                        "border px-4 py-2 font-mono text-sm transition-all",
                        expiryDays === option.value
                          ? "border-usdc bg-usdc-dim text-usdc"
                          : "border-border-subtle text-text-secondary hover:border-border-default",
                      )}
                    >
                      {option.value === 1 ? "1D" : `${option.value}D`}
                    </button>
                  ))}
                </div>
              </div>
              </div>
            </div>

            <div className="rule-gradient my-8" />

            {!isCorrectNetwork ? (
              <Button
                onClick={switchToArc}
                disabled={isSwitching}
                className="btn-sharp w-full bg-pending py-4 text-sm font-semibold text-black hover:bg-pending/90 disabled:cursor-not-allowed disabled:opacity-50"
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
            ) : walletInitializing ? (
              <Button
                disabled
                className="btn-sharp w-full cursor-not-allowed bg-usdc py-4 text-sm font-semibold text-white opacity-70"
              >
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Initializing wallet...
                </span>
              </Button>
            ) : isSubmitting ? (
              <Button
                disabled
                className="btn-sharp w-full cursor-not-allowed bg-usdc py-4 text-sm font-semibold text-white opacity-70"
              >
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Awaiting wallet confirmation...
                </span>
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!isWalletReady || !canSubmit || isSubmitting || submitLockRef.current}
                className="btn-sharp w-full bg-usdc py-4 text-[16px] font-semibold text-white hover:bg-cyan"
              >
                {!address || !hasSigned ? "Connect wallet first" : "Create Agreement"}
              </Button>
            )}
            {submitError && (
              <p className="mt-2 text-center text-xs text-dispute">
                {submitError}
              </p>
            )}
            <p className="mt-2 text-center text-xs text-text-tertiary">
              This will prompt a wallet transaction. No funds are deposited yet.
            </p>
          </div>

          <div className="lg:sticky lg:top-24 lg:h-fit">
            <div className="mb-3 font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary">
              Deal Preview
            </div>
            <div className="border border-border-default bg-surface p-6">
              <div className="flex items-center gap-2">
                <DealStatusBadge status="Active" />
                <DealTypeChip
                  type={dealType === "MutualStake" ? "mutual" : "one-sided"}
                />
              </div>

              <h3 className="mt-6 text-xl font-semibold text-text-primary">
                {title || (
                  <span className="text-text-tertiary">
                    New deal
                  </span>
                )}
              </h3>

              <div className="rule-gradient my-5" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <WalletAddress
                      address={address || "0x0000...0000"}
                      showCopy={false}
                    />
                    <div className="text-xs text-text-tertiary">
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
                      <span className="font-mono text-sm text-text-tertiary">
                        0x...
                      </span>
                    )}
                    <div className="text-xs text-text-tertiary">
                      Counterparty
                    </div>
                  </div>
                  {dealType === "MutualStake" && (
                    <USDCAmount amount={theirDepositNum} size="sm" />
                  )}
                </div>
              </div>

              <div className="rule-gradient my-5" />

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Platform Arbitrator</span>
                  <span className="font-mono text-xs text-text-secondary">
                    0xdd4c...1b61
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Expires</span>
                  <span className="font-mono text-text-secondary">
                    {formatExpiry(expiryDate).text}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Fee</span>
                  <span className="font-mono text-text-secondary">2.5%</span>
                </div>
              </div>

              <div className="rule-gradient my-6" />
              <div className="text-center font-display text-[20px] italic text-text-tertiary/40">
                Clinch
              </div>
              <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-text-tertiary">
                Funds are not locked until both parties deposit
              </p>
            </div>
          </div>
        </div>
      </div>
      <GatewayFundingModal open={fundingOpen} onOpenChange={setFundingOpen} />
    </div>
  );
}
