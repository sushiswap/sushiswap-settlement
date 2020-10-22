// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;

library Orders {
    enum Status {Invalid, Fillable, Expired, Filled}

    bytes32 internal constant ORDER_TYPEHASH = keccak256(
        // solhint-disable-next-line
        "Order(address maker,address fromToken,address toToken,address amountIn,address amountOutMin,address recipient,address deadline)"
    );

    struct Order {
        address maker;
        address fromToken;
        address toToken;
        uint256 amountIn;
        uint256 amountOutMin;
        address recipient;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    function hash(Order memory order) internal pure returns (bytes32) {
        return
            hash(
                order.maker,
                order.fromToken,
                order.toToken,
                order.amountIn,
                order.amountOutMin,
                order.recipient,
                order.deadline
            );
    }

    function hash(
        address maker,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    ORDER_TYPEHASH,
                    maker,
                    fromToken,
                    toToken,
                    amountIn,
                    amountOutMin,
                    recipient,
                    deadline
                )
            );
    }
}
