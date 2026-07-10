"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const vehicle_routes_1 = __importDefault(require("./routes/vehicle.routes"));
const tracker_routes_1 = __importDefault(require("./routes/tracker.routes"));
const tracker_test_routes_1 = __importDefault(require("./routes/tracker.test.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const error_middleware_1 = require("./middlewares/error.middleware");
const websocket_service_1 = require("./tracker/websocket.service");
const tcp_server_1 = require("./tracker/tcp.server");
const scheduler_1 = require("./cron/scheduler");
const cors_2 = require("./config/cors");
for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (!process.env[key]) {
        throw new Error(`Variable d'environnement ${key} manquante — arrêt du serveur.`);
    }
}
const app = (0, express_1.default)();
const httpServer = http_1.default.createServer(app);
const PORT = Number(process.env.PORT ?? 3000);
app.use((0, cors_1.default)({ origin: cors_2.corsOrigins, credentials: true }));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, morgan_1.default)('dev'));
app.get('/health', (_, res) => {
    res.json({ status: 'OK', app: 'FAUCON API', timestamp: new Date().toISOString() });
});
app.get('/version', (_, res) => {
    res.send(" Bonjour, je suis la FAUCON API ! Version 1.0.0");
});
// `/vehicles` est le nom de ressource canonique (aligné sur le modèle Prisma
// `Vehicule`). Historiquement monté aussi sous `/devices` en doublon — retiré
// pour éviter deux surfaces d'API identiques à maintenir.
app.use('/auth', auth_routes_1.default);
app.use('/vehicles', vehicle_routes_1.default);
app.use('/tracker', tracker_routes_1.default);
app.use('/test', tracker_test_routes_1.default);
app.use('/admin', admin_routes_1.default);
app.use(error_middleware_1.notFound);
app.use(error_middleware_1.errorHandler);
(0, websocket_service_1.initWebSocket)(httpServer);
(0, tcp_server_1.startTcpServer)();
(0, scheduler_1.startCronJobs)();
httpServer.listen(PORT, () => {
    console.log(`\n🦅 FAUCON API démarrée sur http://localhost:${PORT}`);
    console.log(`📡 Environnement : ${process.env.NODE_ENV}\n`);
});
exports.default = app;
