const express = require("express");
const cors = require("cors");
const { RtcTokenBuilder, RtcRole } = require("agora-token");

const app = express();
app.use(cors());

const APP_ID = "a7f1cbafd8e34f9f968446e0a9869d69";
const APP_CERTIFICATE = "354c07fd31df42e19151aae973f301b3";

// Simple in-memory rate limiter: max 20 token requests per IP per minute
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const requestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

// Clean up old entries every 5 minutes so memory doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of requestLog.entries()) {
    const fresh = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (fresh.length === 0) {
      requestLog.delete(ip);
    } else {
      requestLog.set(ip, fresh);
    }
  }
}, 5 * 60 * 1000);

app.get("/token", (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests, please slow down." });
  }

  const channelName = req.query.channelName;
  const uid = req.query.uid || 0;

  if (!channelName) {
    return res.status(400).json({ error: "channelName is required" });
  }

  const expirationTimeInSeconds = 3600;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERTIFICATE,
    channelName,
    Number(uid),
    RtcRole.PUBLISHER,
    privilegeExpiredTs,
    privilegeExpiredTs
  );

  res.json({ token });
});

app.get("/", (req, res) => {
  res.send("Callomee token server is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Token server running on port ${PORT}`);
});
