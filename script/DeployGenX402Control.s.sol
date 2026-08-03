// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {GenX402Control} from "../contracts/base/GenX402Control.sol";

interface Vm {
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployGenX402Control {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (GenX402Control control) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(privateKey);
        control = new GenX402Control(
            0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E,
            0x4a53cFB1CCFf805246C28aBd1Ec56F8B56F4D08E,
            0x036CbD53842c5426634e7929541eC2318f3dCF7e
        );
        vm.stopBroadcast();
    }
}
