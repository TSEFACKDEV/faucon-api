"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.secureEqual = void 0;
const crypto_1 = require("crypto");
// Comparaison à temps constant pour les secrets/clés API — une comparaison
// `===`/`!==` classique s'arrête au premier octet différent, ce qui fuit une
// information exploitable par timing attack sur un secret partagé.
const secureEqual = (a, b) => {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(bufA, bufB);
};
exports.secureEqual = secureEqual;
