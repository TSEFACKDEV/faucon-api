import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import authRoutes    from './routes/auth.routes';
import vehicleRoutes from './routes/vehicle.routes';
import trackerRoutes from './routes/tracker.routes';
import trackerTestRoutes from './routes/tracker.test.routes';
import adminRoutes    from './routes/admin.routes';
import { errorHandler, notFound } from './middlewares/error.middleware';
import { initWebSocket }  from './tracker/websocket.service';
import { startTcpServer } from './tracker/tcp.server';
import { startCronJobs }  from './cron/scheduler';
import { corsOrigins } from './config/cors';

for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
  if (!process.env[key]) {
    throw new Error(`Variable d'environnement ${key} manquante — arrêt du serveur.`);
  }
}

const app        = express();
const httpServer = http.createServer(app);
const PORT       = Number(process.env.PORT ?? 3000);

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/health', (_, res) => {
  res.json({ status: 'OK', app: 'FAUCON API', timestamp: new Date().toISOString() });
});
app.get('/version', (_, res) => {
  res.send(" Bonjour, je suis la FAUCON API ! Version 1.0.0");
});
// `/vehicles` est le nom de ressource canonique (aligné sur le modèle Prisma
// `Vehicule`). Historiquement monté aussi sous `/devices` en doublon — retiré
// pour éviter deux surfaces d'API identiques à maintenir.
app.use('/auth',     authRoutes);
app.use('/vehicles', vehicleRoutes);
app.use('/tracker',  trackerRoutes);
app.use('/test', trackerTestRoutes);
app.use('/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

initWebSocket(httpServer);
startTcpServer();
startCronJobs();

httpServer.listen(PORT, () => {
  console.log(`\n🦅 FAUCON API démarrée sur http://localhost:${PORT}`);
  console.log(`📡 Environnement : ${process.env.NODE_ENV}\n`);
});

export default app;