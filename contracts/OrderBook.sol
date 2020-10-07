// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IERC20.sol";
import "./libraries/Orders.sol";
import "./libraries/Verifier.sol";

contract OrderBook {
    using Orders for Orders.Order;

    event OrderCreated(bytes32 indexed hash);
    event OrderCancelled(bytes32 indexed hash);

    mapping(address => bytes32[]) internal _hashesOfMaker;
    mapping(address => bytes32[]) internal _hashesOfFromToken;
    mapping(address => bytes32[]) internal _hashesOfToToken;
    mapping(bytes32 => Orders.Order) public orders;

    function hashesOfMaker(address maker) public view returns (bytes32[] memory) {
        return _hashesOfMaker[maker];
    }

    function hashesOfFromToken(address fromToken) public view returns (bytes32[] memory) {
        return _hashesOfFromToken[fromToken];
    }

    function hashesOfToToken(address toToken) public view returns (bytes32[] memory) {
        return _hashesOfToToken[toToken];
    }

    function createOrder(
        address maker,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(maker != address(0), "invalid-maker-address");
        require(fromToken != address(0), "invalid-from-token-address");
        require(toToken != address(0), "invalid-to-token-address");
        require(fromToken != toToken, "duplicate-token-addresses");
        require(amountIn > 0, "invalid-amount-in");
        require(amountOutMin > 0, "invalid-amount-out-min");
        require(recipient != address(0), "invalid-recipient");
        require(deadline > block.timestamp, "invalid-deadline");

        bytes32 hash = createOrderCallHash(
            maker,
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            recipient,
            deadline
        );
        require(Verifier.verify(maker, hash, v, r, s), "not-signed-by-maker");

        Orders.Order storage order = orders[hash];
        require(order.maker == address(0), "order-exists");
        order.maker = maker;
        order.fromToken = fromToken;
        order.toToken = toToken;
        order.amountIn = amountIn;
        order.amountOutMin = amountOutMin;
        order.recipient = recipient;
        order.deadline = deadline;
        order.v = v;
        order.r = r;
        order.s = s;

        _hashesOfMaker[order.maker].push(hash);
        _hashesOfFromToken[fromToken].push(hash);
        _hashesOfToToken[toToken].push(hash);

        emit OrderCreated(hash);
    }

    function createOrderCallHash(
        address maker,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient,
        uint256 deadline
    ) public view returns (bytes32) {
        return Orders.hash(maker, fromToken, toToken, amountIn, amountOutMin, recipient, deadline);
    }

    function cancelOrder(
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        Orders.Order storage order = orders[hash];
        require(order.maker != address(0), "no-order-exists");

        bytes32 callHash = cancelOrderCallHash(hash);
        require(Verifier.verify(order.maker, callHash, v, r, s), "not-signed-by-maker");

        _removeHash(_hashesOfMaker[order.maker], hash);
        _removeHash(_hashesOfFromToken[order.fromToken], hash);
        _removeHash(_hashesOfToToken[order.toToken], hash);

        emit OrderCancelled(hash);
    }

    function _removeHash(bytes32[] storage hashes, bytes32 hash) internal {
        for (uint256 i = 0; i < hashes.length; i++) {
            if (hashes[i] == hash) {
                hashes[i] = hashes[hashes.length - 1];
                hashes.pop();
            }
        }
    }

    function cancelOrderCallHash(bytes32 hash) public view returns (bytes32) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        return keccak256(abi.encodePacked(chainId, address(this), this.cancelOrder.selector, hash));
    }
}
