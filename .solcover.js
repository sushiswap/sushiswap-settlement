module.exports = {
    norpc: true,
    skipFiles: ["mock/", "interfaces/", "libraries/"],
    testCommand: "npm test",
    compileCommand: "npm run compile",
    providerOptions: {
        default_balance_ether: "10000000000000000000000000",
    },
    mocha: {
        fgrep: "[skip-on-coverage]",
        invert: true,
    },
};
