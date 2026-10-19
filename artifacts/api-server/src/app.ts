import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import router from "./routes/index.js";

const app: Express = express();

// S18: Security headers via helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Managed by reverse proxy or frontend SPA
  })
);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim().replace(/\/$/, ""))
  : [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      "https://hormang.uz",
      "https://www.hormang.uz",
    ];

// S14: Strict CORS policy
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        return cb(null, true);
      }
      const normalizedOrigin = origin.trim().replace(/\/$/, "");
      const isAllowed = allowedOrigins.includes(normalizedOrigin);

      if (isAllowed || (process.env.NODE_ENV !== "production" && (origin.includes("localhost") || origin.includes("127.0.0.1")))) {
        cb(null, true);
      } else {
        cb(new Error(`CORS origin not allowed: ${origin}`));
      }
    },
    credentials: true,
  })
);

app.use(cookieParser());
// S16: Enforce reasonable 15mb body limit instead of 50mb
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.use("/api", router);

export default app;
