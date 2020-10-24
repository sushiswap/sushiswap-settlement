// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IERC20.sol";
import "./libraries/Orders.sol";
import "./libraries/Verifier.sol";
import "./libraries/Bytes32Pagination.sol";

contract OrderBook {
    using Orders for Orders.Order;
    using Bytes32Pagination for bytes32[];

    event OrderCreated(bytes32 indexed hash);

    bytes32[] internal _allHashes;
    mapping(address => bytes32[]) internal _hashesOfMaker;
    mapping(address => bytes32[]) internal _hashesOfFromToken;
    mapping(address => bytes32[]) internal _hashesOfToToken;
    mapping(bytes32 => Orders.Order) public orderOfHash;

    function numberOfHashesOfMaker(address maker) public view returns (uint256) {
        return _hashesOfMaker[maker].length;
    }

    function numberOfHashesOfFromToken(address fromToken) public view returns (uint256) {
        return _hashesOfFromToken[fromToken].length;
    }

    function numberOfHashesOfToToken(address toToken) public view returns (uint256) {
        return _hashesOfToToken[toToken].length;
    }

    function numberOfAllHashes() public view returns (uint256) {
        return _allHashes.length;
    }

    function hashesOfMaker(
        address maker,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _hashesOfMaker[maker].paginate(page, limit);
    }

    function hashesOfFromToken(
        address fromToken,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _hashesOfFromToken[fromToken].paginate(page, limit);
    }

    function hashesOfToToken(
        address toToken,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _hashesOfToToken[toToken].paginate(page, limit);
    }

    function allHashes(uint256 page, uint256 limit) public view returns (bytes32[] memory) {
        return _allHashes.paginate(page, limit);
    }

    function createOrder(Orders.Order memory order) public {
        require(order.maker != address(0), "invalid-maker-address");
        require(order.fromToken != address(0), "invalid-from-token-address");
        require(order.toToken != address(0), "invalid-to-token-address");
        require(order.fromToken != order.toToken, "duplicate-token-addresses");
        require(order.amountIn > 0, "invalid-amount-in");
        require(order.amountOutMin > 0, "invalid-amount-out-min");
        require(order.recipient != address(0), "invalid-recipient");
        require(order.deadline > block.timestamp, "invalid-deadline");

        bytes32 hash = createOrderCallHash(
            order.maker,
            order.fromToken,
            order.toToken,
            order.amountIn,
            order.amountOutMin,
            order.recipient,
            order.deadline
        );
        require(
            Verifier.verify(order.maker, hash, order.v, order.r, order.s),
            "not-signed-by-maker"
        );

        require(orderOfHash[hash].maker == address(0), "order-exists");
        orderOfHash[hash] = order;

        _addHash(_allHashes, hash, order.deadline);
        _addHash(_hashesOfMaker[order.maker], hash, order.deadline);
        _addHash(_hashesOfFromToken[order.fromToken], hash, order.deadline);
        _addHash(_hashesOfToToken[order.toToken], hash, order.deadline);

        emit OrderCreated(hash);
    }

    function _addHash(
        bytes32[] storage hashes,
        bytes32 hash,
        uint256 deadline
    ) internal {
        // hashes are ordered by deadline increasingly
        if (hashes.length == 0) {
            hashes.push(hash);
            return;
        }
        uint256 index = uint256(-1);
        for (uint256 i = 0; i < hashes.length; i++) {
            if (orderOfHash[hashes[i]].deadline > deadline) {
                index = i;
                break;
            }
        }
        if (index == uint256(-1)) {
            hashes.push(hash);
            return;
        }
        hashes.push();
        for (uint256 i = hashes.length - 1; i > index; i--) {
            hashes[i] = hashes[i - 1];
        }
        hashes[index] = hash;
    }

    function createOrderCallHash(
        address maker,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient,
        uint256 deadline
    ) public pure returns (bytes32) {
        return Orders.hash(maker, fromToken, toToken, amountIn, amountOutMin, recipient, deadline);
    }
}
