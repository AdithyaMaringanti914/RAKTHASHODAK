import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Twilio trial: set secret TWILIO_VERIFIED_NUMBERS to comma-separated E.164 numbers
 * (e.g. +9198XXXXXXXX,+9199XXXXXXXX). If unset or empty, no whitelist is applied
 * (use for paid Twilio accounts). Trial accounts without this may hit error 21608.
 */
function getTwilioVerifiedWhitelist(): Set<string> | null {
  const raw = Deno.env.get("TWILIO_VERIFIED_NUMBERS");
  if (raw == null || raw.trim() === "") return null;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const twilioRequest = async (
  accountSid: string,
  authToken: string,
  endpoint: "Messages" | "Calls",
  params: Record<string, string>
) => {
  const form = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => form.append(key, value));

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
    const details = await response.text();
    throw new Error(`${endpoint} failed: ${details}`);
  }

  return response.json();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { to, body, voiceMessage, sendSms, sendVoice } = await req.json();
    const shouldSendSms = sendSms === undefined ? true : Boolean(sendSms);
    const shouldSendVoice = sendVoice === undefined ? Boolean(voiceMessage) : Boolean(sendVoice);

    if (!to || (!shouldSendSms && !shouldSendVoice)) {
      return new Response(JSON.stringify({ error: "Missing required payload: to and at least one channel" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (shouldSendSms && !body) {
      return new Response(JSON.stringify({ error: "Missing required payload: body for SMS" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (shouldSendVoice && !voiceMessage) {
      return new Response(JSON.stringify({ error: "Missing required payload: voiceMessage for voice call" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanTo = String(to).replace(/[^0-9+]/g, "");
    const formattedTo = cleanTo.startsWith("+") ? cleanTo : `+91${cleanTo}`;

    const verifiedWhitelist = getTwilioVerifiedWhitelist();
    if (verifiedWhitelist && !verifiedWhitelist.has(formattedTo)) {
      console.warn(`Skipping number not in TWILIO_VERIFIED_NUMBERS: ${formattedTo}`);
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          reason: `${formattedTo} is not in TWILIO_VERIFIED_NUMBERS (Twilio trial whitelist).`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = { sms: false, voice: false };
    const errors: { sms?: string; voice?: string } = {};

    if (shouldSendSms) {
      try {
        await twilioRequest(accountSid, authToken, "Messages", {
          To: formattedTo,
          From: fromNumber,
          Body: String(body),
        });
        results.sms = true;
      } catch (smsError) {
        console.error("Twilio SMS error:", smsError);
        errors.sms = smsError instanceof Error ? smsError.message : String(smsError);
      }
    }

    if (shouldSendVoice) {
      try {
        await twilioRequest(accountSid, authToken, "Calls", {
          To: formattedTo,
          From: fromNumber,
          Twiml: `<Response><Say voice="alice" language="en-IN">${String(voiceMessage)}</Say></Response>`,
        });
        results.voice = true;
      } catch (voiceError) {
        console.error("Twilio voice error:", voiceError);
        errors.voice = voiceError instanceof Error ? voiceError.message : String(voiceError);
      }
    }

    return new Response(JSON.stringify({ success: results.sms || results.voice, results, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
