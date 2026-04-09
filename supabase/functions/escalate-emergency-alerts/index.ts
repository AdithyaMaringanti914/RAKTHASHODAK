import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ── Twilio Trial Whitelist ────────────────────────────────────────────────────
// Only numbers verified in the Twilio console can receive messages on a trial
// account. Add each number here in E.164 format (+91XXXXXXXXXX for India).
// Remove this guard (and the filter below) once the Twilio account is upgraded.
const VERIFIED_NUMBERS = new Set([
  "+919110531198",
  "+919701924599",
  "+917396011662",
  "+919701383757",
]);
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatIndianPhone = (raw: string) => {
  const clean = String(raw).replace(/[^0-9+]/g, "");
  return clean.startsWith("+") ? clean : `+91${clean}`;
};

const twilioRequest = async (
  accountSid: string,
  authToken: string,
  endpoint: "Messages" | "Calls",
  params: Record<string, string>
) => {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) form.append(k, v);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/${endpoint}.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!accountSid || !authToken || !fromNumber) {
      return new Response(JSON.stringify({ error: "Twilio secrets are not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const donorPhones = (body?.donorPhones as string[] | undefined) ?? [];
    const smsBody = String(body?.smsBody ?? "");
    const voiceMessage = String(body?.voiceMessage ?? "");

    if (donorPhones.length === 0 || !smsBody || !voiceMessage) {
      return new Response(
        JSON.stringify({ error: "Missing payload: donorPhones, smsBody, voiceMessage" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Trial-account guard: filter out any number not in the Twilio-verified whitelist.
    const allFormatted = donorPhones.map(formatIndianPhone);
    const verifiedPhones = allFormatted.filter((p) => VERIFIED_NUMBERS.has(p));
    const skippedCount = allFormatted.length - verifiedPhones.length;
    if (skippedCount > 0) {
      console.warn(`Skipping ${skippedCount} unverified number(s) (Twilio trial account).`);
    }
    if (verifiedPhones.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          donorsTargeted: 0,
          skippedCount,
          reason: "All donor numbers are unverified on this Twilio trial account.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stage 1 is in-app notification via realtime insert already done by blood_requests creation.
    // Keep a dedicated 10-second window before escalating to telephony.
    await sleep(10_000);

    const smsResults = await Promise.allSettled(
      verifiedPhones.map((phone) =>
        twilioRequest(accountSid, authToken, "Messages", {
          To: phone,
          From: fromNumber,
          Body: smsBody,
        })
      )
    );
    const smsSent = smsResults.filter((r) => r.status === "fulfilled").length;

    await sleep(10_000);

    const voiceResults = await Promise.allSettled(
      verifiedPhones.map((phone) =>
        twilioRequest(accountSid, authToken, "Calls", {
          To: phone,
          From: fromNumber,
          Twiml: `<Response><Say voice="alice" language="en-IN">${voiceMessage}</Say></Response>`,
        })
      )
    );
    const voiceSent = voiceResults.filter((r) => r.status === "fulfilled").length;

    return new Response(
      JSON.stringify({
        success: true,
        donorsTargeted: verifiedPhones.length,
        skippedCount,
        smsSent,
        voiceSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
