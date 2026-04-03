-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Define Enums for strong typing
CREATE TYPE blood_group_type AS ENUM ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');
CREATE TYPE user_role_type AS ENUM ('user', 'hospital', 'admin');
CREATE TYPE request_urgency_type AS ENUM ('normal', 'urgent', 'critical');
CREATE TYPE request_status_type AS ENUM ('open', 'partially_fulfilled', 'fulfilled', 'cancelled');
CREATE TYPE donation_status_type AS ENUM ('pending', 'accepted', 'rejected', 'completed', 'no_show');
CREATE TYPE ride_status_type AS ENUM ('scheduled', 'in_transit', 'completed', 'cancelled');

-- Users & Profiles
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    blood_group blood_group_type,
    role user_role_type DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE donor_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_available BOOLEAN DEFAULT false,
    last_donation_date DATE,
    location GEOGRAPHY(Point, 4326), 
    home_location_text TEXT,
    health_status_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Requests & Assignments
CREATE TABLE requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_name TEXT NOT NULL,
    blood_group_needed blood_group_type NOT NULL,
    units_required INT NOT NULL CHECK (units_required > 0),
    units_fulfilled INT NOT NULL DEFAULT 0 CHECK (units_fulfilled >= 0),
    location GEOGRAPHY(Point, 4326) NOT NULL,
    hospital_name TEXT NOT NULL,
    urgency_level request_urgency_type DEFAULT 'normal',
    status request_status_type DEFAULT 'open',
    needed_by TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_units CHECK (units_fulfilled <= units_required)
);

CREATE TABLE request_donors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status donation_status_type DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(request_id, donor_id)
);

-- Chat System
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID REFERENCES requests(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_participants (
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications & Rides
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    reference_id UUID,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    driver_name TEXT NOT NULL,
    driver_phone TEXT,
    vehicle_info TEXT NOT NULL,
    status ride_status_type DEFAULT 'scheduled',
    estimated_arrival TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX idx_donor_profiles_location ON donor_profiles USING GIST (location);
CREATE INDEX idx_requests_location ON requests USING GIST (location);
CREATE INDEX idx_requests_status_bg ON requests(status, blood_group_needed);
CREATE INDEX idx_req_donors_request_status ON request_donors(request_id, status);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_notifications_user_id ON notifications(user_id, is_read);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER donor_profiles_updated_at BEFORE UPDATE ON donor_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER requests_updated_at BEFORE UPDATE ON requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER request_donors_updated_at BEFORE UPDATE ON request_donors FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RPC for Atomic Donor Assignment
CREATE OR REPLACE FUNCTION accept_blood_request(req_id UUID, d_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    req_record RECORD;
BEGIN
    SELECT * INTO req_record FROM requests WHERE id = req_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    IF req_record.status NOT IN ('open', 'partially_fulfilled') THEN
        RAISE EXCEPTION 'Request is no longer accepting donors';
    END IF;

    IF req_record.units_fulfilled >= req_record.units_required THEN
        RAISE EXCEPTION 'Request units are already fulfilled';
    END IF;

    INSERT INTO request_donors (request_id, donor_id, status)
    VALUES (req_id, d_id, 'accepted')
    ON CONFLICT (request_id, donor_id) DO UPDATE SET status = 'accepted';

    UPDATE requests 
    SET 
        units_fulfilled = units_fulfilled + 1,
        status = CASE 
            WHEN (units_fulfilled + 1) >= req_record.units_required THEN 'fulfilled'::request_status_type 
            ELSE 'partially_fulfilled'::request_status_type 
        END
    WHERE id = req_id;

    RETURN TRUE;
END;
$$;

-- Real-time configurations
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

ALTER PUBLICATION supabase_realtime ADD TABLE requests;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
