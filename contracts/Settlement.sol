// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "@sushiswap/core/contracts/uniswapv2/libraries/SafeMath.sol";
import "@sushiswap/core/contracts/uniswapv2/libraries/TransferHelper.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IERC20.sol";
import "./interfaces/IMintable.sol";
import "./libraries/EIP712.sol";
import "./libraries/Bytes32Pagination.sol";
import "./mixins/Ownable.sol";
import "./UniswapV2Router02Settlement.sol";

contract Settlement is Ownable, UniswapV2Router02Settlement {
    using SafeMathUniswap for uint256;
    using Orders for Orders.Order;
    using Bytes32Pagination for bytes32[];

    // Maximum fee= 1%
    uint256 public constant MAX_FEE_NUMERATOR = 100;
    // Maximum fee split = 50%
    uint256 public constant MAX_FEE_SPLIT_NUMERATOR = 5000;
    // solhint-disable-next-line var-name-mixedcase
    bytes32 public DOMAIN_SEPARATOR;

    bool private _initialized;
    // Array of hashes of all canceled orders
    bytes32[] internal _allCanceledHashes;
    // Address of order maker => canceled hashes (orders)
    mapping(address => bytes32[]) internal _canceledHashesOfMaker;
    // Address of fromToken => canceled hashes (orders)
    mapping(address => bytes32[]) internal _canceledHashesOfFromToken;
    // Address of toToken => canceled hashes (orders)
    mapping(address => bytes32[]) internal _canceledHashesOfToToken;
    // Hash of an order => if canceled
    mapping(bytes32 => bool) public canceledOfHash;
    // Hash of an order => filledAmountIn
    mapping(bytes32 => uint256) public filledAmountInOfHash;

    // Address of the Sushi token
    address public sushi;

    // This address receives (feeSplitNumerator / 10000) of fee for every order filling
    address public feeSplitRecipient;

    // Used to calculate the total fee of an order
    // Denominator is 10000
    uint256 public feeNumerator;

    // Used to calculate how big the share going to the relayer is
    // Out of fee, denominator is 10000
    uint256 public feeSplitNumerator;

    function initialize(
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
        require(!_initialized, "already-initialized");

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
        UniswapV2Router02Settlement._initialize(_factory, _weth);

        sushi = _sushi;
        feeSplitRecipient = _feeSplitRecipient;
        feeNumerator = _feeNumerator;
        feeSplitNumerator = _feeSplitNumerator;

        _initialized = true;
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

    // Returns the number of canceled orders of a maker
    function numberOfCanceledHashesOfMaker(address maker) public view returns (uint256) {
        return _canceledHashesOfMaker[maker].length;
    }

    // Return the number of canceled orders where fromToken is the origin token
    function numberOfCanceledHashesOfFromToken(address fromToken) public view returns (uint256) {
        return _canceledHashesOfFromToken[fromToken].length;
    }

    // Return the number of canceled orders where toToken is the target token
    function numberOfCanceledHashesOfToToken(address toToken) public view returns (uint256) {
        return _canceledHashesOfToToken[toToken].length;
    }

    // Returns the number of canceled orders
    function numberOfAllCanceledHashes() public view returns (uint256) {
        return _allCanceledHashes.length;
    }

    // Returns an array of hashes of canceled orders of a maker
    function canceledHashesOfMaker(
        address maker,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _canceledHashesOfMaker[maker].paginate(page, limit);
    }

    // Returns an array of hashes of canceled orders where fromToken is the origin token
    function canceledHashesOfFromToken(
        address fromToken,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _canceledHashesOfFromToken[fromToken].paginate(page, limit);
    }

    // Returns an array of hashes of canceled orders where toToken is the target token
    function canceledHashesOfToToken(
        address toToken,
        uint256 page,
        uint256 limit
    ) public view returns (bytes32[] memory) {
        return _canceledHashesOfToToken[toToken].paginate(page, limit);
    }

    // Return an array of canceled hashes
    function allCanceledHashes(uint256 page, uint256 limit) public view returns (bytes32[] memory) {
        return _allCanceledHashes.paginate(page, limit);
    }

    // Fills an order
    function fillOrder(FillOrderArgs memory args) public override returns (uint256 amountOut) {
        // solhint-disable-next-line avoid-tx-origin
        require(msg.sender == tx.origin, "called-by-contract");
        // voids flashloan attack vectors

        // Check the approved amount from maker
        uint256 allowance = IERC20Uniswap(args.order.fromToken).allowance(args.order.maker, address(this));
        if (allowance < args.amountToFillIn) {
            return 0;
        }
        // Check if the signature is valid
        bytes32 hash = args.order.hash();
        address signer = EIP712.recover(DOMAIN_SEPARATOR, hash, args.order.v, args.order.r, args.order.s);
        if (signer == address(0) || signer != args.order.maker) {
            return 0;
        }
        // Check if the order is valid
        if (!_validateArgs(args)) {
            return 0;
        }
        // Check if the order is canceled / already fully filled
        if (!_validateStatus(args, hash)) {
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
        if (canceledOfHash[hash]) {
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
        // If fromToken is WETH then path is [fromToken, sushi], otherwise [fromToken, WETH, sushi]
        address _weth = WETH;
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
    function cancelOrder(Orders.Order memory order) public override {
        require(msg.sender == order.maker, "not-called-by-maker");

        bytes32 hash = order.hash();
        address signer = EIP712.recover(DOMAIN_SEPARATOR, hash, order.v, order.r, order.s);
        require(signer != address(0) && signer == order.maker, "invalid-signature");
        require(!canceledOfHash[hash], "already-canceled");

        _allCanceledHashes.push(hash);
        _canceledHashesOfMaker[order.maker].push(hash);
        _canceledHashesOfFromToken[order.fromToken].push(hash);
        _canceledHashesOfToToken[order.toToken].push(hash);
        canceledOfHash[hash] = true;

        emit OrderCanceled(hash);
    }
}
