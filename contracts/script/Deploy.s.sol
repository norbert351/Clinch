// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {Escrow} from "../src/Escrow.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address adminWallet = vm.envAddress("ADMIN_WALLET");
        address platformArbitrator = vm.envAddress("PLATFORM_ARBITRATOR");
        uint256 feePercent = vm.envUint("FEE_PERCENT");
        
        vm.startBroadcast(deployerPrivateKey);

        Escrow escrow = new Escrow(
            usdcAddress,
            adminWallet,
            adminWallet,
            platformArbitrator,
            feePercent
        );
        console2.log("Escrow deployed at:", address(escrow));
        console2.log("Platform Arbitrator:", platformArbitrator);

        vm.stopBroadcast();
    }
}
