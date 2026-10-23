import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../middlewares/error";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const userSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "KASIR"]).default("KASIR"),
});

router.post("/login", async (req, res) => {
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

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      passwordHash: await bcrypt.hash(data.password, 10),
    },
    select: { id: true, name: true, email: true, role: true },
  });
  res.status(201).json(user);
});

export default router;
