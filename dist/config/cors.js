"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsOrigins = void 0;
// Liste d'origines autorisées, partagée entre Express (CORS HTTP) et
// Socket.IO (WebSocket), pour éviter deux configurations divergentes.
// `CORS_ORIGIN` accepte une liste séparée par des virgules.
// Si la variable est absente OU vide, on retombe sur la liste locale par défaut
// (une valeur vide produirait sinon un tableau vide : aucune origine autorisée).
const raw = process.env.CORS_ORIGIN?.trim() ? process.env.CORS_ORIGIN : 'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005,http://localhost:3006,http://localhost:3007,http://localhost:3008,http://localhost:3009';
exports.corsOrigins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
