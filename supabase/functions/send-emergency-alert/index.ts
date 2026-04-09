import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ── Twilio Trial Whitelist ────────────────────────────────────────────────────
// Only numbers verified in the Twilio console can receive messages on a trial
// account. Add each number here in E.164 format (+91XXXXXXXXXX for India).
// Remove this guard (and the VERIFIED_NUMBERS check below) once the Twilio
// account is upgraded to a paid plan.
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

    // Trial-account guard: skip unverified numbers to avoid Twilio error 21608.
    if (!VERIFIED_NUMBERS.has(formattedTo)) {
      console.warn(`Skipping unverified number: ${formattedTo}`);
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          reason: `${formattedTo} is not in the Twilio-verified whitelist (trial account).`,
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
