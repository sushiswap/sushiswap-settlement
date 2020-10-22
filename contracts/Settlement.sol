// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "@sushiswap/core/contracts/uniswapv2/libraries/SafeMath.sol";
import "@sushiswap/core/contracts/uniswapv2/libraries/TransferHelper.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./interfaces/IMintable.sol";
import "./libraries/Verifier.sol";
import "./libraries/Bytes32Pagination.sol";
import "./mixins/Ownable.sol";
import "./UniswapV2Router02Settlement.sol";

contract Settlement is Ownable, UniswapV2Router02Settlement {
    using SafeMathUniswap for uint256;
    using Orders for Orders.Order;
    using Bytes32Pagination for bytes32[];

    bool private _initialized;
    bytes32[] internal _allCanceledHashes;
    mapping(address => bytes32[]) internal _canceledHashesOfMaker;
    mapping(address => bytes32[]) internal _canceledHashesOfFromToken;
    mapping(address => bytes32[]) internal _canceledHashesOfToToken;
    mapping(bytes32 => bool) public canceled;
    uint256 public feeNumerator;
    uint256 public feeDenominator;
    mapping(bytes32 => uint256) public filledAmountInOfHash;

    function initialize(
        address owner,
        address _factory,
        // solhint-disable-next-line var-name-mixedcase
        address _WETH,
        uint256 _feeNumerator,
        uint256 _feeDenominator
    ) public {
        require(!_initialized, "already-initialized");

        Ownable._initialize(owner);
        UniswapV2Router02Settlement._initialize(_factory, _WETH);

        feeNumerator = _feeNumerator;
        feeDenominator = _feeDenominator;

        _initialized = true;
    }

    function updateFee(uint256 _feeNumerator, uint256 _feeDenominator) public onlyOwner {
        feeNumerator = _feeNumerator;
        feeDenominator = _feeDenominator;
    }

    function numberOfCanceledHashesOfMaker(address maker) public view returns (uint256) {
        return _canceledHashesOfMaker[maker].length;
    }

    function numberOfCanceledHashesOfFromToken(address fromToken) public view returns (uint256) {
        return _canceledHashesOfFromToken[fromToken].length;
    }

    function numberOfCanceledHashesOfToToken(address toToken) public view returns (uint256) {
        return _canceledHashesOfToToken[toToken].length;
    }

    function numberOfAllCanceledHashes() public view returns (uint256) {
        return _allCanceledHashes.length;
    }

    function canceledHashesOfMaker(
        address maker,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _canceledHashesOfMaker[maker].paginate(page, limit);
    }

    function canceledHashesOfFromToken(
        address fromToken,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _canceledHashesOfFromToken[fromToken].paginate(page, limit);
    }

    function canceledHashesOfToToken(
        address toToken,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _canceledHashesOfToToken[toToken].paginate(page, limit);
    }

    function allCanceledHashes(uint256 page, uint256 limit) public view returns (bytes32[] memory) {
        return _allCanceledHashes.paginate(page, limit);
    }

    function hashOfOrder(
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

    function fillOrder(FillOrderArgs memory args) public override returns (uint256 amountOut) {
        bytes32 hash = args.order.hash();
        if (canceled[hash]) {
            return 0;
        }
        if (!_validateArgs(args, hash)) {
            return 0;
        }
        if (!_validateStatus(args, hash)) {
            return 0;
        }

        // Calculate fee deducted amountIn and amountOutMin
        (uint256 amountIn, uint256 amountOutMin) = (
            args.amountToFillIn,
            args.order.amountOutMin.mul(args.amountToFillIn) / args.order.amountIn
        );
        (uint256 numerator, uint256 denominator) = (feeNumerator, feeDenominator);
        if (numerator > 0 && denominator > 0) {
            amountIn = amountIn.sub(amountIn.mul(numerator) / denominator);
            amountOutMin = amountOutMin.sub(amountOutMin.mul(numerator) / denominator);
        }

        // requires args.amountToFillIn to have already been approved to this
        amountOut = _swapExactTokensForTokens(
            args.order.maker,
            amountIn,
            amountOutMin,
            args.path,
            args.order.recipient
        );

        if (amountOut > 0) {
            // Transfer fee if any
            if (args.amountToFillIn > amountIn) {
                uint256 fee = args.amountToFillIn.sub(amountIn);
                TransferHelper.safeTransferFrom(
                    args.order.fromToken,
                    args.order.maker,
                    msg.sender,
                    fee
                );

                emit OrderFeeTransferred(hash, msg.sender, fee);
            }

            // Update order status
            filledAmountInOfHash[hash] = filledAmountInOfHash[hash].add(args.amountToFillIn);

            emit OrderFilled(hash, args.amountToFillIn, amountOut);
        }
    }

    function _validateArgs(FillOrderArgs memory args, bytes32 hash) internal pure returns (bool) {
        return
            args.order.maker != address(0) &&
            args.order.fromToken != address(0) &&
            args.order.toToken != address(0) &&
            args.order.fromToken != args.order.toToken &&
            args.order.amountIn != uint256(0) &&
            args.order.amountOutMin != uint256(0) &&
            args.order.deadline != uint256(0) &&
            args.amountToFillIn > 0 &&
            args.path.length >= 2 &&
            args.order.fromToken == args.path[0] &&
            args.order.toToken == args.path[args.path.length - 1] &&
            Verifier.verify(args.order.maker, hash, args.order.v, args.order.r, args.order.s);
    }

    function _validateStatus(FillOrderArgs memory args, bytes32 hash) internal view returns (bool) {
        if (args.order.deadline < block.timestamp) {
            return false;
        }
        uint256 filledAmountIn = filledAmountInOfHash[hash];
        if (filledAmountIn.add(args.amountToFillIn) > args.order.amountIn) {
            return false;
        }
        return true;
    }

    function _swapExactTokensForTokens(
        address from,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory path,
        address to
    ) internal returns (uint256 amountOut) {
        uint256[] memory amounts = UniswapV2Library.getAmountsOut(factory, amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) {
            return 0;
        }
        address pair = UniswapV2Library.pairFor(factory, path[0], path[1]);
        // bytes4(keccak256(bytes('transferFrom(address,address,uint256)')));
        (bool success, ) = path[0].call(abi.encodeWithSelector(0x23b872dd, from, pair, amountIn));
        if (!success) {
            return 0;
        }
        _swap(amounts, path, to);
        amountOut = amounts[amounts.length - 1];
    }

    function fillOrders(FillOrderArgs[] memory args)
        public
        override
        returns (uint256[] memory amountsOut)
    {
        amountsOut = new uint256[](args.length);
        for (uint256 i = 0; i < args.length; i++) {
            amountsOut[i] = fillOrder(args[i]);
        }
    }

    function cancelOrder(Orders.Order memory order) public override {
        bytes32 hash = order.hash();
        require(Verifier.verify(order.maker, hash, order.v, order.r, order.s), "invalid-order");
        require(msg.sender == order.maker, "not-called-by-maker");

        _allCanceledHashes.push(hash);
        _canceledHashesOfMaker[order.maker].push(hash);
        _canceledHashesOfFromToken[order.fromToken].push(hash);
        _canceledHashesOfToToken[order.toToken].push(hash);
        canceled[hash] = true;

        emit OrderCanceled(hash);
    }
}
