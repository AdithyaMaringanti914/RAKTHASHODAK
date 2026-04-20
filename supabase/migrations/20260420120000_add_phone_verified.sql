-- Apply phone_verified flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;

-- OTP challenges table: stores temporary verification codes
CREATE TABLE IF NOT EXISTS otp_challenges (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone       TEXT        NOT NULL,
  otp         TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE otp_challenges ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own OTP rows
CREATE POLICY "users_own_otp_challenges"
  ON otp_challenges
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
