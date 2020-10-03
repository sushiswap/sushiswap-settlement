// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "./BaseSettlement.sol";
import "./UniswapV2Router02.sol";

contract Settlement is BaseSettlement, UniswapV2Router02 {
    constructor(IMintable _rewardToken, uint256 _rewardPerAmountFilled) public {
        rewardToken = _rewardToken;
        rewardPerAmountFilled = _rewardPerAmountFilled;
    }
}
