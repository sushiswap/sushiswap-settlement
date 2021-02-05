// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "@sushiswap/core/contracts/uniswapv2/libraries/SafeMath.sol";
import "@sushiswap/core/contracts/uniswapv2/libraries/TransferHelper.sol";
import "@sushiswap/core/contracts/uniswapv2/libraries/UniswapV2Library.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IERC20.sol";
import "./interfaces/ISettlement.sol";
import "./libraries/Orders.sol";
import "./libraries/EIP712.sol";
import "./libraries/Bytes32Pagination.sol";
import "./mixins/Ownable.sol";

contract Settlement is Ownable, ISettlement {
    using SafeMathUniswap for uint256;
    using Orders for Orders.Order;
    using Bytes32Pagination for bytes32[];

    // Maximum fee= 1%
    uint256 public constant MAX_FEE_NUMERATOR = 100;
    // Maximum fee split = 50%
    uint256 public constant MAX_FEE_SPLIT_NUMERATOR = 5000;
    // solhint-disable-next-line var-name-mixedcase
    bytes32 public immutable DOMAIN_SEPARATOR;

    // Hash of an order => if canceled
    mapping(address => mapping(bytes32 => bool)) public canceledOfHash;
    // Hash of an order => filledAmountIn
    mapping(bytes32 => uint256) public filledAmountInOfHash;

    address public immutable factory;

    address public immutable weth;

    // Address of the Sushi token
    address public immutable sushi;

    // This address receives (feeSplitNumerator / 10000) of fee for every order filling
    address public immutable feeSplitRecipient;

    // Used to calculate the total fee of an order
    // Denominator is 10000
    uint256 public feeNumerator;

    // Used to calculate how big the share going to the relayer is
    // Out of fee, denominator is 10000
    uint256 public feeSplitNumerator;

    constructor(
        uint256 orderBookChainId,
        address orderBookAddress,
        address owner,
        address _factory,
        address _weth,
        address _sushi,
        address _feeSplitRecipient,
        uint256 _feeNumerator,
        uint256 _feeSplitNumerator
    ) public {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("OrderBook"),
                keccak256("1"),
                orderBookChainId,
                orderBookAddress
            )
        );

        Ownable._initialize(owner);

        factory = _factory;
        weth = _weth;
        sushi = _sushi;
        feeSplitRecipient = _feeSplitRecipient;
        feeNumerator = _feeNumerator;
        feeSplitNumerator = _feeSplitNumerator;
    }

    // Updates the fee amount
    function updateFee(uint256 _feeNumerator) public onlyOwner {
        require(_feeNumerator < MAX_FEE_NUMERATOR, "fee-too-high");
        feeNumerator = _feeNumerator;
    }

    // Updates the fee's split ratio between the relayer and feeSplitRecipient
    function updateFeeSplit(uint256 _feeSplitNumerator) public onlyOwner {
        require(_feeSplitNumerator < MAX_FEE_SPLIT_NUMERATOR, "fee-split-too-high");
        feeSplitNumerator = _feeSplitNumerator;
    }

    // Fills an order
    function fillOrder(FillOrderArgs memory args) public override returns (uint256 amountOut) {
        // solhint-disable-next-line avoid-tx-origin
        require(msg.sender == tx.origin, "called-by-contract");
        // voids flashloan attack vectors

        bytes32 hash = args.order.hash();
        // Check if the order is valid
        if (!_validateArgs(args)) {
            return 0;
        }
        // Check if the order is canceled / already fully filled
        if (!_validateStatus(args, hash)) {
            return 0;
        }
        // Check if the signature is valid
        address signer = EIP712.recover(DOMAIN_SEPARATOR, hash, args.order.v, args.order.r, args.order.s);
        if (signer == address(0) || signer != args.order.maker) {
            return 0;
        }

        // Check the approved amount from maker
        uint256 allowance = IERC20Uniswap(args.order.fromToken).allowance(args.order.maker, address(this));
        if (allowance < args.amountToFillIn) {
            return 0;
        }
        // Calculates fee deducted amountIn and amountOutMin
        (uint256 amountIn, uint256 amountOutMin) = (
            args.amountToFillIn,
            args.order.amountOutMin.mul(args.amountToFillIn) / args.order.amountIn
        );
        uint256 _feeNumerator = feeNumerator;
        uint256 fee = amountIn.mul(_feeNumerator) / 10000;
        if (fee > 0) {
            amountIn = amountIn.sub(fee);
            amountOutMin = amountOutMin.sub(amountOutMin.mul(_feeNumerator) / 10000);
        }

        // Requires args.amountToFillIn to have already been approved to this
        amountOut = _swapExactTokensForTokens(
            args.order.maker,
            amountIn,
            amountOutMin,
            args.path,
            args.order.recipient
        );

        if (amountOut > 0) {
            if (fee > 0) {
                _transferFees(args.order.fromToken, args.order.maker, fee, hash);
            }

            // This line is free from reentrancy issues since UniswapV2Pair prevents from them
            filledAmountInOfHash[hash] = filledAmountInOfHash[hash].add(args.amountToFillIn);

            emit OrderFilled(hash, args.amountToFillIn, amountOut);
        }
    }

    // Checks if an order is valid - if it contains all the information required
    function _validateArgs(FillOrderArgs memory args) internal view returns (bool) {
        return
            args.order.maker != address(0) &&
            args.order.fromToken != address(0) &&
            args.order.toToken != address(0) &&
            args.order.fromToken != args.order.toToken &&
            args.order.amountIn != uint256(0) &&
            args.order.amountOutMin != uint256(0) &&
            args.order.recipient != address(0) &&
            args.order.deadline != uint256(0) &&
            args.order.deadline >= block.timestamp &&
            args.amountToFillIn > 0 &&
            args.path.length >= 2 &&
            args.order.fromToken == args.path[0] &&
            args.order.toToken == args.path[args.path.length - 1];
    }

    // Checks if an order is canceled / already fully filled
    function _validateStatus(FillOrderArgs memory args, bytes32 hash) internal view returns (bool) {
        if (canceledOfHash[args.order.maker][hash]) {
            return false;
        }
        if (filledAmountInOfHash[hash].add(args.amountToFillIn) > args.order.amountIn) {
            return false;
        }
        return true;
    }

    // Transfers the fees to the feeSplitRecipient and the relayer
    function _transferFees(
        address fromToken,
        address maker,
        uint256 amount,
        bytes32 hash
    ) internal {
        if (fromToken == sushi) {
            uint256 feeSplit = amount.mul(feeSplitNumerator) / 10000;
            if (feeSplit > 0) {
                address _recipient = feeSplitRecipient;
                TransferHelper.safeTransferFrom(sushi, maker, _recipient, feeSplit);
                emit FeeSplitTransferred(hash, _recipient, feeSplit);
            }
            uint256 remainder = amount.sub(feeSplit);
            TransferHelper.safeTransferFrom(sushi, maker, msg.sender, remainder);
            emit FeeTransferred(hash, msg.sender, remainder);
            return;
        }
        // If fromToken is weth then path is [fromToken, sushi], otherwise [fromToken, weth, sushi]
        address _weth = weth;
        address[] memory path = new address[](fromToken == _weth ? 2 : 3);
        path[path.length - 1] = sushi;
        path[path.length - 2] = _weth;
        if (fromToken != _weth) {
            path[0] = fromToken;
        }
        uint256 amountOfSushi = _swapExactTokensForTokens(maker, amount, 0, path, address(this));
        require(amountOfSushi > 0, "swap-to-sushi-failure");

        uint256 feeSplit = amountOfSushi.mul(feeSplitNumerator) / 10000;
        if (feeSplit > 0) {
            address _recipient = feeSplitRecipient;
            TransferHelper.safeTransfer(sushi, _recipient, feeSplit);
            emit FeeSplitTransferred(hash, _recipient, feeSplit);
        }
        uint256 remainder = amountOfSushi.sub(feeSplit);
        TransferHelper.safeTransfer(sushi, msg.sender, remainder);
        emit FeeTransferred(hash, msg.sender, remainder);
    }

    // Swaps an exact amount of tokens for another token through the path passed as an argument
    // Returns the amount of the final token
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
        TransferHelper.safeTransferFrom(path[0], from, UniswapV2Library.pairFor(factory, path[0], path[1]), amountIn);
        _swap(amounts, path, to);
        amountOut = amounts[amounts.length - 1];
    }

    // requires the initial amount to have already been sent to the first pair
    function _swap(
        uint256[] memory amounts,
        address[] memory path,
        address _to
    ) internal virtual {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = UniswapV2Library.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < path.length - 2 ? UniswapV2Library.pairFor(factory, output, path[i + 2]) : _to;
            IUniswapV2Pair(UniswapV2Library.pairFor(factory, input, output)).swap(
                amount0Out,
                amount1Out,
                to,
                new bytes(0)
            );
        }
    }

    // Fills multiple orders passed as an array
    function fillOrders(FillOrderArgs[] memory args) public override returns (uint256[] memory amountsOut) {
        bool filled = false;
        amountsOut = new uint256[](args.length);
        for (uint256 i = 0; i < args.length; i++) {
            // Returns zero of the order wasn't filled
            amountsOut[i] = fillOrder(args[i]);
            if (amountsOut[i] > 0) {
                // At least one order was filled
                filled = true;
            }
        }
        require(filled, "no-order-filled");
    }

    // Cancels an order, has to been called by order maker
    function cancelOrder(bytes32 hash) public override {
        canceledOfHash[msg.sender][hash] = true;

        emit OrderCanceled(hash);
    }
}
