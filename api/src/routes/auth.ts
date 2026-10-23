import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../middlewares/error";
import { requireAuth, requireRole, roles } from "../middlewares/auth";
import { audit } from "../services/audit";

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit." },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const userSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(roles).default("KASIR"),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(roles).optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Minimal satu data akun harus diubah.",
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
});

router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, "Email atau password salah");
  }

  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: "8h" });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, email: true, role: true },
  });
  res.json(user);
});

router.post("/users", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const data = userSchema.parse(req.body);
  const exists = await prisma.user.findUnique({ where: { email: data.email } });

  if (exists) throw new AppError(409, "Email sudah terdaftar");

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name: data.name, email: data.email, role: data.role, passwordHash },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "USER_CREATE",
      entity: "User",
      entityId: created.id,
      after: { name: created.name, email: created.email, role: created.role, isActive: created.isActive },
      ip: req.ip,
    });
    return created;
  });
  res.status(201).json(user);
});

router.get("/users", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  res.json(await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  }));
});

router.put("/users/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const data = updateUserSchema.parse(req.body);
  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!existing) throw new AppError(404, "Akun tidak ditemukan");

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    await audit(tx, {
      userId: req.user!.id,
      action: "USER_UPDATE",
      entity: "User",
      entityId: id,
      before: { name: existing.name, role: existing.role, isActive: existing.isActive },
      after: { name: updated.name, role: updated.role, isActive: updated.isActive },
      ip: req.ip,
    });
    return updated;
  });
  res.json(user);
});

router.post("/change-password", requireAuth, async (req, res) => {
  const data = changePasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await bcrypt.compare(data.currentPassword, user.passwordHash))) {
    throw new AppError(400, "Kata sandi saat ini tidak sesuai");
  }

  const passwordHash = await bcrypt.hash(data.newPassword, 10);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await audit(tx, {
      userId: user.id,
      action: "USER_CHANGE_PASSWORD",
      entity: "User",
      entityId: user.id,
      after: { passwordChanged: true },
      ip: req.ip,
    });
  });
  res.json({ message: "Kata sandi berhasil diubah" });
});

export default router;
