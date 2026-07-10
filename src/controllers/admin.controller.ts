import { Request, Response } from 'express';
import { provisionerLot } from '../services/provisioning.service';
import { sendSuccess, sendError } from '../utils/response';

export const adminController = {
  provisionVehicules: async (req: Request, res: Response) => {
    try {
      const count = Number(req.body.count ?? 0);
      const prefix = String(req.body.prefix ?? 'FCN');

      const lot = await provisionerLot(count, prefix);
      return sendSuccess(res, `${lot.length} traceur(s) provisionné(s)`, lot, 201);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },
};
