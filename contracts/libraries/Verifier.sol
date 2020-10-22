// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;

library Verifier {
    function verify(
        address signer,
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal pure returns (bool) {
        // It needs to have been signed by web3.eth_sign
        hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        return signer == ecrecover(hash, v, r, s);
    }
}
