import { Request } from 'express';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    userName: string;
  };
}

export interface JwtPayload {
  id: string;
  email: string;
  userName: string;
}

export interface ApiResponse<T = null> {
  success: boolean;
  message: string;
  data?: T;
}