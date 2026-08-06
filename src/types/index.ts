import { Request } from 'express';
import { Role } from '../generated/prisma/enums';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    userName: string;
    role?: Role;
  };
}

export interface JwtPayload {
  id: string;
  email: string;
  userName: string;
  role?: Role;
}

export type { Role };

export interface ApiResponse<T = null> {
  success: boolean;
  message: string;
  data?: T;
}