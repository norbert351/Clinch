// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

enum DealType {
    MutualStake,
    OneSided
}

enum DealStatus {
    Active,
    Confirmed,
    Disputed,
    Resolved,
    Cancelled,
    Expired
}

enum Outcome {
    None,
    PartyAWins,
    PartyBWins,
    Split
}
