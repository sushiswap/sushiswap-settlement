// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "../libraries/Orders.sol";

interface ISettlement {
    event OrderFilled(bytes32 hash, uint256 amountIn, uint256 amountOut);

    struct FillOrderArgs {
        Orders.Order order;
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 amountToFillIn;
        address[] path;
    }

    function fillOrder(FillOrderArgs calldata args) external returns (uint256 amountOut);

    function fillOrders(FillOrderArgs[] calldata args)
        external
        returns (uint256[] memory amountsOut);
}
