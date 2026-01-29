// app/routes/api.verify-otp.jsx
import { verifyOtp } from "../otpStore.server.js";

export async function action({ request }) {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const body = await request.json();
  const email = String(body.email || "").trim();
  const otp = String(body.otp || "").trim();
  const token = String(body.token || "").trim();

  if (!email || !otp || !token) {
    return new Response(
      JSON.stringify({ error: "Missing fields" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const ok = verifyOtp(email, token, otp);

  return new Response(
    JSON.stringify({ verified: ok }),
    {
      status: ok ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    }
  );
}