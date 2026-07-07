import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import authRoutes    from './routes/auth.routes';
import vehicleRoutes from './routes/vehicle.routes';
import trackerRoutes from './routes/tracker.routes';
import { errorHandler, notFound } from './middlewares/error.middleware';
import { initWebSocket }  from './tracker/websocket.service';
import { startTcpServer } from './tracker/tcp.server';
import { startCronJobs }  from './cron/scheduler';

const app        = express();
const httpServer = http.createServer(app);
const PORT       = Number(process.env.PORT ?? 3000);

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/health', (_, res) => {
  res.json({ status: 'OK', app: 'FAUCON API', timestamp: new Date().toISOString() });
});

app.use('/auth',     authRoutes);
app.use('/vehicles', vehicleRoutes);
app.use('/devices',  vehicleRoutes);
app.use('/tracker',  trackerRoutes);

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