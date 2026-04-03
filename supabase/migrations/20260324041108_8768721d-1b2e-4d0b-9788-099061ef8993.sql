
-- Donations history table
CREATE TABLE public.donations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  donor_id UUID NOT NULL,
  request_id UUID REFERENCES public.blood_requests(id) ON DELETE SET NULL,
  blood_group TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1,
  hospital_name TEXT NOT NULL,
  donated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Donors can view own donations" ON public.donations
  FOR SELECT TO authenticated USING (auth.uid() = donor_id);

CREATE POLICY "Donors can insert own donations" ON public.donations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = donor_id AND has_role(auth.uid(), 'donor'::app_role));

-- Chat messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.blood_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view chat messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR auth.uid() IN (
      SELECT requester_id FROM public.blood_requests WHERE id = request_id
    )
    OR auth.uid() IN (
      SELECT donor_id FROM public.donor_responses WHERE request_id = chat_messages.request_id
    )
  );

CREATE POLICY "Participants can send chat messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      auth.uid() IN (
        SELECT requester_id FROM public.blood_requests WHERE id = request_id
      )
      OR auth.uid() IN (
        SELECT donor_id FROM public.donor_responses WHERE request_id = chat_messages.request_id
      )
    )
  );

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
