require("dotenv/config");

require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-solhint");
require("hardhat-spdx-license-identifier");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
require("hardhat-gas-reporter");
require("solidity-coverage");

const accounts = {
    mnemonic: "test test test test test test test test test test test junk",
};

module.exports = {
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            gas: 12000000,
            blockGasLimit: 12000000,
            allowUnlimitedContractSize: true,
            accounts,
            live: false,
            saveDeployments: true,
        },
        // kovan: {
        //     url: "https://eth-kovan.alchemyapi.io/v2/PMRs9b7XcmbELUeDN8zF_ZbKY5W4ktW2",
        //     accounts: [process.env.PRIVATE_KEY],
        // },
        // rinkeby: {
        //     url: "https://eth-rinkeby.alchemyapi.io/v2/OJZiZG5_0djOzypR6uz3tlam1dlIgvBS",
        //     accounts: [process.env.PRIVATE_KEY],
        // },
        // mainnet: {
        //     url: "https://eth-mainnet.alchemyapi.io/v2/XJnOcVECGudg6TXd78CsRXl-cFpuunzZ",
        //     accounts: [process.env.PRIVATE_KEY],
        // },
    },
    namedAccounts: {
        deployer: 0,
        relayer: 1,
        user: 2,
    },
    gasReporter: {
        enabled: !!process.env.REPORT_GAS,
        currency: "USD",
        coinmarketcap: process.env.COINMARKETCAP_API_KEY,
        excludeContracts: ["contracts/mock/", "contracts/libraries/"],
    },
    solidity: {
        version: "0.6.12",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    // mocha: {
    //     timeout: 20000,
    // },
};
