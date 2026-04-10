-- Allow any authenticated user to see which accounts are donors (user_id only).
-- Needed for requesters to discover donors for maps, nearby search, and Twilio escalation.
-- Existing policy still allows users to read their own role row(s); policies are OR'd.
CREATE POLICY "Authenticated users can read donor role rows"
ON public.user_roles
FOR SELECT
TO authenticated
USING (role = 'donor'::public.app_role);
