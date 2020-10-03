// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "./BaseSettlement.sol";
import "./UniswapV2Router02Delegator.sol";
import "./MasterChefDelegator.sol";

contract Settlement is BaseSettlement, UniswapV2Router02Delegator, MasterChefDelegator {
    constructor(
        IMasterChef _masterChef,
        IMintable _rewardToken,
        uint256 _rewardPerAmountFilled
    ) public MasterChefDelegator(_masterChef) {
        rewardToken = _rewardToken;
        rewardPerAmountFilled = _rewardPerAmountFilled;
    }
}
