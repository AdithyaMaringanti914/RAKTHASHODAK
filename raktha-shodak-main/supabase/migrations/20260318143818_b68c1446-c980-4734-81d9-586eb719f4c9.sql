
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('donor', 'requester');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  blood_group TEXT,
  avatar_url TEXT,
  total_donations INTEGER NOT NULL DEFAULT 0,
  reliability_score NUMERIC(3,1) NOT NULL DEFAULT 5.0,
  last_donation_date DATE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Create blood_requests table
CREATE TABLE public.blood_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blood_group TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1,
  urgency TEXT NOT NULL DEFAULT 'urgent',
  hospital_name TEXT NOT NULL,
  hospital_address TEXT,
  hospital_lat DOUBLE PRECISION,
  hospital_lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'searching',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create donor_responses table
CREATE TABLE public.donor_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.blood_requests(id) ON DELETE CASCADE,
  donor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMP WITH TIME ZONE,
  arrived_at TIMESTAMP WITH TIME ZONE,
  donor_lat DOUBLE PRECISION,
  donor_lng DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (request_id, donor_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_responses ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User roles policies
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Blood requests policies
CREATE POLICY "Anyone authenticated can view requests" ON public.blood_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Requesters can create requests" ON public.blood_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id AND public.has_role(auth.uid(), 'requester'));
CREATE POLICY "Requesters can update own requests" ON public.blood_requests FOR UPDATE TO authenticated USING (auth.uid() = requester_id);

-- Donor responses policies
CREATE POLICY "Request owner and donor can view responses" ON public.donor_responses FOR SELECT TO authenticated USING (
  auth.uid() = donor_id OR 
  auth.uid() IN (SELECT requester_id FROM public.blood_requests WHERE id = request_id)
);
CREATE POLICY "Donors can create responses" ON public.donor_responses FOR INSERT TO authenticated WITH CHECK (auth.uid() = donor_id AND public.has_role(auth.uid(), 'donor'));
CREATE POLICY "Donors can update own responses" ON public.donor_responses FOR UPDATE TO authenticated USING (auth.uid() = donor_id);

-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_blood_requests_updated_at BEFORE UPDATE ON public.blood_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_donor_responses_updated_at BEFORE UPDATE ON public.donor_responses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
