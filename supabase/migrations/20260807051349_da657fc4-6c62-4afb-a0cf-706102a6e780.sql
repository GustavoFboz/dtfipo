ALTER TABLE public.tooth_colors ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
DELETE FROM public.tooth_colors;
INSERT INTO public.tooth_colors (code, sort_order) VALUES 
('A1', 10), ('A2', 20), ('A3', 30), ('A3.5', 40), ('A4', 50), 
('B1', 60), ('B2', 70), ('B3', 80), ('B4', 90), 
('C1', 100), ('C2', 110), ('C3', 120), ('C4', 130), 
('D2', 140), ('D3', 150), ('D4', 160), 
('BL1', 170), ('BL2', 180), ('BL3', 190), ('BL4', 200);