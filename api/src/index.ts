import "dotenv/config";
import express from "express";
import cors from "cors";
import { errorHandler } from "./middlewares/error";

import authRoutes from "./routes/auth";
import categoryRoutes from "./routes/categories";
import productRoutes from "./routes/products";
import stockRoutes from "./routes/stock";
import saleRoutes from "./routes/sales";
import reportRoutes from "./routes/reports"; // TAMBAHAN

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/reports", reportRoutes); // TAMBAHAN

app.use(errorHandler);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Server jalan di http://localhost:${port}`));
