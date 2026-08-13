"use strict";
// Constantes partagées du domaine — source unique, à importer partout plutôt
// que de re-coder les seuils dans chaque service/client.
Object.defineProperty(exports, "__esModule", { value: true });
exports.EN_LIGNE_SEUIL_MS = void 0;
// Durée au-delà de laquelle un traceur est considéré « hors ligne » faute de
// nouvelle communication. DOIT être strictement supérieure à la plus longue
// période d'émission du firmware (STANDBY à l'arrêt : 5 min = 300 000 ms),
// sinon un traceur allumé qui émet à la cadence maximale bascule
// périodiquement « hors ligne » juste avant l'arrivée de la trame suivante.
exports.EN_LIGNE_SEUIL_MS = 10 * 60 * 1000;
