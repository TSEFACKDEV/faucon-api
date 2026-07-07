import express from 'express';
import { handlePositionPayload } from '../tracker/position.handler';
import { findVehiculeByIdentifier } from '../services/vehicle-lookup.service';

const router = express.Router();

// POST /test/trame - body: full trame JSON or minimal POSITION fields
router.post('/trame', async (req, res) => {
  try {
    const trame = req.body;
    if (!trame || !trame.type || !trame.imei) return res.status(400).json({ error: 'Invalid payload' });

    const vehicule = await findVehiculeByIdentifier(trame.imei);
    if (!vehicule) return res.status(404).json({ error: 'Vehicule not found for imei/trackerId' });

    if (trame.type === 'POSITION') {
      await handlePositionPayload(vehicule.id, {
        latitude: trame.lat,
        longitude: trame.lon,
        vitesse: trame.speed || 0,
        cap: trame.cap || 0,
        battery: trame.battery || 0,
        timestamp: new Date(trame.ts),
        source: 'http',
      });
      return res.json({ status: 'OK' });
    }

    return res.status(400).json({ error: 'Only POSITION trame supported by this test endpoint' });
  } catch (err) {
    console.error('[TEST ROUTE] Error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
