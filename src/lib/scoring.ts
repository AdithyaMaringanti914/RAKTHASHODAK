import { Hospital } from "@/hooks/useNearbyHospitals";

export interface ScoreResult {
  score: number;
  reason: string;
}

export function calculateScore(
  hospital: Hospital,
  userLocation: { lat: number; lng: number } | null, // Location provided to align with requirements, though distanceKm is pre-computed directly on hospital.
  urgency: string
): ScoreResult {
  let score = 0;
  let reasons: string[] = [];

  // Distance Weighting
  // If Critical, distance penalty is aggressive. If standard, distance penalty is moderate.
  const distanceMultiplier = urgency === "Critical" ? 10 : urgency === "Urgent" ? 5 : 3;
  const distanceScore = Math.max(0, 50 - (hospital.distanceKm * distanceMultiplier));
  score += distanceScore;

  if (hospital.distanceKm <= 2) {
    reasons.push("Extremely close proximity");
  } else if (hospital.distanceKm <= 5) {
    reasons.push("Nearby location");
  }

  // Type Weighting
  // Blood banks are heavily preferred because they hold verified active stock
  if (hospital.type === "blood_bank") {
    score += 30;
    reasons.unshift("Direct blood bank facility");
  }

  // Availability Weighting
  switch (hospital.availability) {
    case "Likely Available":
      score += 40;
      reasons.push("Currently open");
      break;
    case "Limited Availability":
      score += 10;
      break;
    case "Check Required":
      score -= 20; // High risk for critical urgencies
      break;
  }

  // Reason distillation logic
  let finalReason = "Nearest available option";
  if (urgency === "Critical" && hospital.distanceKm <= 3 && hospital.availability === "Likely Available") {
    finalReason = "Fastest viable critical dispatch";
    score += 20; // Extra bonus for perfect critical match
  } else if (reasons.length > 0) {
    // Pick the most relevant high-priority reason
    finalReason = reasons[0];
  }

  if (hospital.availability === "Check Required") {
    finalReason = "Call to verify stock before routing";
  }

  return { score, reason: finalReason };
}
