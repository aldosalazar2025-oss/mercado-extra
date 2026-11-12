-- MERCADO EXTRA · Etapa 5 · Un DNI solo puede estar en una cuenta.
-- Los registros rechazados quedan fuera de la regla, para que un DNI usado por un suplantador
-- (y rechazado por la administración) vuelva a estar disponible para su dueño real.
create unique index idx_identity_dni_unico
  on public.identity_verifications (dni)
  where status <> 'rechazado';
