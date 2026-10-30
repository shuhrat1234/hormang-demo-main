import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDist = path.resolve(__dirname, "../dist");
const landingPublic = path.resolve(__dirname, "../../hormang-landing/public/provider");
const landingDist = path.resolve(__dirname, "../../hormang-landing/dist/public/provider");

if (fs.existsSync(srcDist)) {
  // Sync to landing public/provider
  fs.mkdirSync(landingPublic, { recursive: true });
  fs.cpSync(srcDist, landingPublic, { recursive: true });
  console.log(`[sync] Copied provider site build to ${landingPublic}`);

  // Sync to landing dist/public/provider if dist exists
  const landingDistParent = path.resolve(__dirname, "../../hormang-landing/dist/public");
  if (fs.existsSync(landingDistParent)) {
    fs.mkdirSync(landingDist, { recursive: true });
    fs.cpSync(srcDist, landingDist, { recursive: true });
    console.log(`[sync] Copied provider site build to ${landingDist}`);
  }
} else {
  console.warn(`[sync] Source dist folder not found: ${srcDist}`);
}
