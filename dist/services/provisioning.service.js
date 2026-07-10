"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.provisionerLot = void 0;
const crypto_1 = require("crypto");
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L) pour un PIN lisible
// sur une étiquette imprimée.
const PIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PIN_LENGTH = 6;
const MAX_TENTATIVES_UNICITE = 20;
const genererPin = () => Array.from({ length: PIN_LENGTH }, () => PIN_ALPHABET[(0, crypto_1.randomInt)(PIN_ALPHABET.length)]).join('');
const genererSuffixe = () => String((0, crypto_1.randomInt)(0, 10000)).padStart(4, '0');
/**
 * Pré-enregistre un lot de traceurs avant leur flashage/vente. Chaque
 * trackerId généré ici doit être recopié dans la constante TRACKER_ID du
 * firmware de l'unité correspondante, et le pin imprimé sur l'étiquette du
 * boîtier (jamais affiché ailleurs) — il sera exigé par l'app au moment où
 * le client relie le traceur à son compte.
 */
const provisionerLot = async (count, prefix) => {
    if (count < 1 || count > 500) {
        throw new errors_1.AppError('count doit être compris entre 1 et 500', 400);
    }
    if (!/^[A-Z0-9]{2,10}$/i.test(prefix)) {
        throw new errors_1.AppError('prefix invalide (2 à 10 caractères alphanumériques)', 400);
    }
    const resultats = [];
    for (let i = 0; i < count; i++) {
        let trackerId = '';
        let pinActivation = '';
        for (let tentative = 0; tentative < MAX_TENTATIVES_UNICITE; tentative++) {
            const candidat = `${prefix.toUpperCase()}-${genererSuffixe()}`;
            const existant = await database_1.prisma.vehicule.findUnique({ where: { trackerId: candidat } });
            if (!existant) {
                trackerId = candidat;
                break;
            }
        }
        if (!trackerId) {
            throw new errors_1.AppError(`Impossible de générer un trackerId unique pour le préfixe "${prefix}" — préfixe probablement saturé`, 409);
        }
        pinActivation = genererPin();
        await database_1.prisma.vehicule.create({
            data: {
                trackerId,
                pinActivation,
                nom: `Traceur ${trackerId}`,
                estActif: false,
            },
        });
        resultats.push({ trackerId, pinActivation });
    }
    return resultats;
};
exports.provisionerLot = provisionerLot;
