-- Solo lectura. Ejecuta cada consulta por separado en el SQL Editor de Supabase para ver por qué una tienda recibió una solicitud.

-- 1) Categorías que declaró cada tienda (revisa que no figure una que no vendes):
select s.name as tienda, c.name as categoria
from public.stores s
join public.store_categories sc on sc.store_id = s.id
join public.categories c on c.id = sc.category_id
order by s.name, c.name;

-- 2) En qué categorías tiene productos publicados cada tienda:
select s.name as tienda, c.name as categoria, count(*) as productos
from public.products p
join public.stores s on s.id = p.store_id
join public.categories c on c.id = p.category_id
where p.status = 'activo' and not p.admin_hidden
group by s.name, c.name
order by s.name, c.name;

-- 3) Qué tiendas recibieron cada solicitud reciente y por qué (matched_by):
select r.title as solicitud, cat.name as categoria_solicitada, s.name as tienda, m.score, m.matched_by
from public.request_matches m
join public.requests r on r.id = m.request_id
join public.stores s on s.id = m.store_id
left join public.categories cat on cat.id = r.category_id
order by r.created_at desc, m.score desc
limit 30;
