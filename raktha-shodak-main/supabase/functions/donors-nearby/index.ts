import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claims, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const bloodGroup = url.searchParams.get("blood_group");
    const lat = parseFloat(url.searchParams.get("lat") || "0");
    const lng = parseFloat(url.searchParams.get("lng") || "0");

    // Find donors with matching blood group who are available
    let query = supabase
      .from("profiles")
      .select("user_id, full_name, blood_group, latitude, longitude, total_donations, reliability_score, is_available")
      .eq("is_available", true);

    if (bloodGroup) {
      query = query.eq("blood_group", bloodGroup);
    }

    // Only get users who have the donor role
    const { data: donorRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "donor");

    const donorIds = donorRoles?.map((r) => r.user_id) || [];

    if (donorIds.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    query = query.in("user_id", donorIds);
    const { data, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate approximate distance if lat/lng provided
    const donors = (data || []).map((donor) => {
      let distance = null;
      if (lat && lng && donor.latitude && donor.longitude) {
        const R = 6371;
        const dLat = ((donor.latitude - lat) * Math.PI) / 180;
        const dLng = ((donor.longitude - lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((lat * Math.PI) / 180) *
            Math.cos((donor.latitude * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }
      return { ...donor, distance_km: distance ? Math.round(distance * 10) / 10 : null };
    });

    // Sort by distance if available
    donors.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));

    return new Response(JSON.stringify(donors), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
