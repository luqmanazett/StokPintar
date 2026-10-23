import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "./error";

export interface AuthUser {
  id: number;
  role: "ADMIN" | "KASIR";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new AppError(401, "Silakan login dulu");

  let payload: AuthUser;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as AuthUser;
  } catch {
    throw new AppError(401, "Token tidak valid atau sudah kedaluwarsa");
  }

  req.user = { id: payload.id, role: payload.role };
  next();
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) throw new AppError(403, "Akses ditolak");
    next();
  };
}
