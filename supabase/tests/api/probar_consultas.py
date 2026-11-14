import json, urllib.request, urllib.parse, subprocess
U=lambda n: f"00000000-0000-0000-0000-{n:012d}"
def token(n, email):
    return subprocess.check_output(["python3","jwt.py",U(n),email]).decode().strip()
T={"anon":None,"u1":token(1,"ana.compradora@prueba.test"),"u3":token(3,"carla.moda@prueba.test"),"u4":token(4,"dario.ferreteria@prueba.test"),"u7":token(7,"zoe.admin@prueba.test")}
def get(quien, ruta):
    req=urllib.request.Request("http://127.0.0.1:3000"+ruta)
    if T[quien]: req.add_header("Authorization","Bearer "+T[quien])
    try:
        with urllib.request.urlopen(req, timeout=10) as r: return r.status, json.loads(r.read() or b"[]")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")
def q(**kw): return "&".join(f"{k}={urllib.parse.quote(str(v), safe='(),:!.*')}" for k,v in kw.items())

casos=[
 ("ANTES (con el error) · Mis solicitudes", "u1", "/requests?"+q(select="id,title,status,offers(id,status)", buyer_id=f"eq.{U(1)}"), 300),
 ("ANTES (con el error) · historial de ofertas", "u1", "/offers?"+q(select="id,status,offer_history(id,version)", request_id=f"eq.{U(350)}"), 300),
 ("AHORA · Mis solicitudes (comprador)", "u1", "/requests?"+q(select="id,title,description,category_id,attributes,max_budget,budget_negotiable,status,expires_at,renewed_count,created_at,categories(name),request_images(id,path),offers!offers_request_id_fkey(id,status)", buyer_id=f"eq.{U(1)}", status="neq.eliminada", order="created_at.desc"), 200),
 ("AHORA · Comparar ofertas (comprador)", "u1", "/offers?"+q(select="id,status,store_id,current_version_id,stores(id,name,address,offers_delivery,offers_pickup,owner_id),offer_history!offer_history_offer_id_fkey(id,version,price,description,availability,delivery_terms,eta,notes,photo_paths,created_at,accepted_by_buyer_at,rejected_by_buyer_at)", request_id=f"eq.{U(350)}", status="neq.retirada"), 200),
 ("AHORA · Mis ofertas (vendedor)", "u3", "/offers?"+q(select="id,status,store_id,request_id,current_version_id,created_at,stores(name),requests!offers_request_id_fkey(id,title,status,max_budget),offer_history!offer_history_offer_id_fkey(id,version,price,created_at,accepted_by_buyer_at,rejected_by_buyer_at)", store_id=f"in.({U(161)},{U(101)})", order="created_at.desc"), 200),
 ("AHORA · Formulario de oferta (vendedor)", "u3", "/offers?"+q(select="id,status,offer_history!offer_history_offer_id_fkey(id,version,price)", request_id=f"eq.{U(350)}", store_id=f"eq.{U(161)}"), 200),
 ("AHORA · Solicitudes recibidas (vendedor)", "u3", "/request_matches?"+q(select="request_id,store_id,score,matched_by,stores(name),requests!inner(id,title,description,attributes,max_budget,budget_negotiable,status,expires_at,categories(name),request_images(id,path))", dismissed="eq.false", **{"requests.status":"in.(abierta,con_ofertas)"}, order="score.desc"), 200),
 ("Detalle de producto (público)", "anon", "/products?"+q(select="id,name,description,price,available,admin_hidden,status,categories(name),stores(id,name,address,phone,offers_delivery,offers_pickup),product_images(path,sort),product_tags(tag)", id=f"eq.{U(201)}"), 200),
 ("Tiendas (público)", "anon", "/stores?"+q(select="id,name,address,logo_path,latitude,longitude,offers_delivery,offers_pickup,store_categories(category_id,categories(name))", status="eq.aprobada", limit=5), 200),
 ("Perfil de tienda: productos (público)", "anon", "/products?"+q(select="id,name,description,price,available,category_id,created_at,categories(name),product_images(path,sort)", store_id=f"eq.{U(101)}", status="eq.activo"), 200),
 ("Mis productos (vendedor)", "u3", "/products?"+q(select="id,name,price,available,status,admin_hidden,admin_hidden_reason,product_images(path,sort)", store_id=f"eq.{U(101)}"), 200),
 ("Admin · tiendas", "u7", "/stores?"+q(select="id,name,status,profiles:owner_id(full_name,email)", status="eq.aprobada", limit=3), 200),
 ("Admin · verificaciones de identidad", "u7", "/identity_verifications?"+q(select="id,user_id,dni,status,profiles:user_id(full_name,email,phone)"), 200),
 ("Admin · productos", "u7", "/products?"+q(select="id,name,price,status,admin_hidden,stores(name),categories(name)", limit=5), 200),
 ("Reputación pública (vista)", "u1", "/perfiles_publicos?"+q(select="id,calificacion_promedio,total_calificaciones,ventas_completadas", id=f"in.({U(3)},{U(4)})"), 200),
]
fallos=0
for nombre,quien,ruta,esperado in casos:
    cod,cuerpo=get(quien,ruta)
    ok = (cod==esperado) or (esperado==300 and cod in (300,))
    extra = (cuerpo.get("code") if isinstance(cuerpo,dict) else f"{len(cuerpo)} filas")
    print(("OK   " if ok else "FALLA"), f"{cod}", nombre, "→", extra)
    if not ok:
        fallos+=1
        print("      ", json.dumps(cuerpo)[:300])
print("\nResultado:", "todas las consultas responden como se espera" if fallos==0 else f"{fallos} consulta(s) con problema")
