"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.haversineKm = exports.haversineMeters = void 0;
const EARTH_RADIUS_M = 6371000;
/**
 * Distance en mètres entre deux points GPS (formule de Haversine).
 */
const haversineMeters = (lat1, lon1, lat2, lon2) => {
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
exports.haversineMeters = haversineMeters;
/**
 * Distance en kilomètres entre deux points GPS (formule de Haversine).
 */
const haversineKm = (lat1, lon1, lat2, lon2) => (0, exports.haversineMeters)(lat1, lon1, lat2, lon2) / 1000;
exports.haversineKm = haversineKm;
