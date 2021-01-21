const { ethers, ethereum, deployments, getNamedAccounts } = require("@nomiclabs/buidler");
const { _TypedDataEncoder } = require("@ethersproject/hash");

class Order {
    static ORDER_TYPEHASH = "0x7c228c78bd055996a44b5046fb56fa7c28c66bce92d9dc584f742b2cd76a140f";

    constructor(
        maker,
        fromToken,
        toToken,
        amountIn,
        amountOutMin,
        recipient = maker._address,
        deadline = ethers.BigNumber.from(Math.floor(Date.now() / 1000 + 24 * 3600))
    ) {
        this.maker = maker;
        this.fromToken = fromToken;
        this.toToken = toToken;
        this.amountIn = amountIn;
        this.amountOutMin = amountOutMin;
        this.recipient = recipient;
        this.deadline = deadline;
    }

    async hash() {
        return ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
                [
                    "bytes32",
                    "address",
                    "address",
                    "address",
                    "uint256",
                    "uint256",
                    "address",
                    "uint256",
                ],
                [
                    Order.ORDER_TYPEHASH,
                    this.maker._address,
                    this.fromToken.address,
                    this.toToken.address,
                    this.amountIn,
                    this.amountOutMin,
                    this.recipient,
                    this.deadline,
                ]
            )
        );
    }

    async sign() {
        const { deployer } = await getNamedAccounts();
        const { address } = await deployments.create2("OrderBook", {
            from: deployer,
            log: true,
        });
        const chainId = Number(await ethereum.send("eth_chainId", []));
        const domain = {
            name: "OrderBook",
            version: "1",
            chainId,
            verifyingContract: address,
        };
        const types = {
            Order: [
                { name: "maker", type: "address" },
                { name: "fromToken", type: "address" },
                { name: "toToken", type: "address" },
                { name: "amountIn", type: "uint256" },
                { name: "amountOutMin", type: "uint256" },
                { name: "recipient", type: "address" },
                { name: "deadline", type: "uint256" },
            ],
        };
        const value = {
            maker: this.maker._address,
            fromToken: this.fromToken.address,
            toToken: this.toToken.address,
            amountIn: this.amountIn,
            amountOutMin: this.amountOutMin,
            recipient: this.recipient,
            deadline: this.deadline,
        };
        const digest = _TypedDataEncoder.hash(domain, types, value);

        // this only works for builderevm
        const privateKey = this.maker.provider._buidlerProvider._node._accountPrivateKeys.get(
            this.maker._address.toLowerCase()
        );
        const key = new ethers.utils.SigningKey(ethers.utils.hexlify(privateKey));
        const signature = key.signDigest(digest);
        return ethers.utils.splitSignature(signature);
    }

    async toArgs() {
        const { v, r, s } = await this.sign();
        return [
            this.maker._address,
            this.fromToken.address,
            this.toToken.address,
            this.amountIn,
            this.amountOutMin,
            this.recipient,
            this.deadline,
            v,
            r,
            s,
        ];
    }
}

module.exports = Order;
