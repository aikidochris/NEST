-- 1. Ensure the is_admin function is secure and checks the existing profile role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND (role::text = 'admin' OR role::text = 'ADMIN') -- Handles text or enum formats
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update neighborhood_anchors policies: Public read, Admin only write
-- This enables you to drag points while keeping them visible to all users
ALTER TABLE public.neighborhood_anchors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view neighborhood anchors" ON public.neighborhood_anchors;
CREATE POLICY "Anyone can view neighborhood anchors" 
ON public.neighborhood_anchors FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage anchors" ON public.neighborhood_anchors;
CREATE POLICY "Admins can manage anchors" 
ON public.neighborhood_anchors 
FOR ALL 
TO authenticated 
USING (is_admin()) 
WITH CHECK (is_admin());

-- 3. PROPERLY APPOINT YOU AS ADMIN
-- This targets your correct email address
UPDATE public.profiles 
SET role = 'admin' 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'aikidochris@gmail.com');