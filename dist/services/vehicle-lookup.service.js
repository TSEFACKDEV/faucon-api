"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findVehiculeByIdentifier = void 0;
const database_1 = require("../config/database");
/**
 * Retrouve un véhicule à partir de l'identifiant transmis par un traceur
 * (IMEI ou trackerId — les deux formats coexistent selon le matériel).
 */
const findVehiculeByIdentifier = (identifier) => database_1.prisma.vehicule.findFirst({
    where: {
        OR: [
            { imei: identifier },
            { trackerId: identifier },
        ],
    },
});
exports.findVehiculeByIdentifier = findVehiculeByIdentifier;
