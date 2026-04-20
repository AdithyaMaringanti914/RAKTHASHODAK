import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const formatPhone = (raw: string): string => {
  const clean = String(raw).replace(/[^0-9+]/g, "");
  return clean.startsWith("+") ? clean : `+91${clean}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken  = Deno.env.get("TWILIO_AUTH_TOKEN");
    const serviceSid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

    if (!accountSid || !authToken || !serviceSid) {
      return new Response(
        JSON.stringify({ error: "Twilio Verify secrets not configured. Add TWILIO_VERIFY_SERVICE_SID to project secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, phone, code } = await req.json();
    const formattedPhone = formatPhone(phone ?? "");

    const authHeader = `Basic ${btoa(`${accountSid}:${authToken}`)}`;
    const baseUrl = `https://verify.twilio.com/v2/Services/${serviceSid}`;

    // ── Send OTP ─────────────────────────────────────────────────────────────
    if (action === "send") {
      const form = new URLSearchParams({ To: formattedPhone, Channel: "sms" });
      const res = await fetch(`${baseUrl}/Verifications`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });

      if (!res.ok) {
        const err = await res.text();
        console.error("Twilio Verify send error:", err);
        return new Response(
          JSON.stringify({ success: false, error: `Failed to send OTP: ${err}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, phone: formattedPhone }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Check OTP ────────────────────────────────────────────────────────────
    if (action === "check") {
      const form = new URLSearchParams({ To: formattedPhone, Code: String(code) });
      const res = await fetch(`${baseUrl}/VerificationCheck`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });

      const data = await res.json();
      const verified = data.status === "approved";

      return new Response(
        JSON.stringify({ success: verified, status: data.status, phone: formattedPhone }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'send' or 'check'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-phone error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
