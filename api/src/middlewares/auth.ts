import { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { prisma } from "../db";
import { AppError } from "./error";

export const roles = ["ADMIN", "MANAJER", "GUDANG", "KASIR"] as const;

export interface AuthUser {
  id: number;
  role: (typeof roles)[number];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new AppError(401, "Silakan login dulu");

  let payload: JwtPayload;
  try {
    const verified = jwt.verify(header.slice(7), process.env.JWT_SECRET!);
    if (typeof verified === "string") throw new Error("Payload token tidak valid");
    payload = verified;
  } catch {
    throw new AppError(401, "Token tidak valid atau sudah kedaluwarsa");
  }

  if (typeof payload.id !== "number" || !Number.isInteger(payload.id)) {
    throw new AppError(401, "Token tidak valid atau sudah kedaluwarsa");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, role: true, isActive: true },
  });
  if (!user?.isActive) throw new AppError(401, "Akun tidak aktif atau tidak ditemukan");

  req.user = { id: user.id, role: user.role };
  next();
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) throw new AppError(403, "Akses ditolak");
    next();
  };
}
