// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;

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

    function numberOfHashesOfMaker(address maker) external view returns (uint256) {
        return _hashesOfMaker[maker].length;
    }

    function numberOfHashesOfFromToken(address fromToken) external view returns (uint256) {
        return _hashesOfFromToken[fromToken].length;
    }

    function numberOfHashesOfToToken(address toToken) external view returns (uint256) {
        return _hashesOfToToken[toToken].length;
    }

    function numberOfAllHashes() external view returns (uint256) {
        return _allHashes.length;
    }

    function hashesOfMaker(
        address maker,
        uint256 page,
        uint256 limit
    ) external view returns (bytes32[] memory) {
        return _hashesOfMaker[maker].paginate(page, limit);
    }

    function hashesOfFromToken(
        address fromToken,
        uint256 page,
        uint256 limit
    ) external view returns (bytes32[] memory) {
        return _hashesOfFromToken[fromToken].paginate(page, limit);
    }

    function hashesOfToToken(
        address toToken,
        uint256 page,
        uint256 limit
    ) external view returns (bytes32[] memory) {
        return _hashesOfToToken[toToken].paginate(page, limit);
    }

    function allHashes(uint256 page, uint256 limit) external view returns (bytes32[] memory) {
        return _allHashes.paginate(page, limit);
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

        Orders.Order storage order = orderOfHash[hash];
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

        _addHash(_allHashes, hash, deadline);
        _addHash(_hashesOfMaker[maker], hash, deadline);
        _addHash(_hashesOfFromToken[fromToken], hash, deadline);
        _addHash(_hashesOfToToken[toToken], hash, deadline);

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
