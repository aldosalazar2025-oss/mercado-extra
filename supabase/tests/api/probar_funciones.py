import json, urllib.request, subprocess
U=lambda n: f"00000000-0000-0000-0000-{n:012d}"
tok=lambda n,e: subprocess.check_output(["python3","jwt.py",U(n),e]).decode().strip()
T={"anon":None,"u1":tok(1,"ana.compradora@prueba.test"),"u3":tok(3,"carla.moda@prueba.test")}
def post(quien, fn, cuerpo):
    r=urllib.request.Request("http://127.0.0.1:3000/rpc/"+fn, data=json.dumps(cuerpo).encode(), method="POST", headers={"Content-Type":"application/json"})
    if T[quien]: r.add_header("Authorization","Bearer "+T[quien])
    try:
        with urllib.request.urlopen(r, timeout=10) as x: return x.status, json.loads(x.read() or b"null")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")
# (nombre, quien, función, cuerpo, ¿esperamos que la función exista? -> no debe ser PGRST202 "no encontrada")
casos=[
 ("buscar_productos (catálogo)","anon","buscar_productos",{"p_texto":None,"p_categoria":None,"p_precio_min":None,"p_precio_max":None,"p_lat":None,"p_lng":None,"p_radio_km":None,"p_orden":"reciente","p_limite":3,"p_desde":0}),
 ("vencer_solicitudes","u1","vencer_solicitudes",{}),
 ("mis_invitaciones","u1","mis_invitaciones",{}),
 ("enviar_oferta (precio 0 debe rechazarse con nuestro mensaje)","u3","enviar_oferta",{"p_request":U(350),"p_store":U(161),"p_price":0,"p_description":"","p_availability":"","p_delivery_terms":"","p_eta":"","p_notes":"","p_photos":[]}),
 ("elegir_oferta (versión inexistente)","u1","elegir_oferta",{"p_version":U(999),"p_modo":"domicilio"}),
 ("responder_propuesta (versión inexistente)","u1","responder_propuesta",{"p_version":U(999),"p_aceptar":True}),
 ("responder_invitacion (invitación inexistente)","u1","responder_invitacion",{"p_id":U(999),"p_aceptar":True}),
 ("registrar_auditoria (un comprador no puede)","u1","registrar_auditoria",{"p_action":"x","p_entity":"y","p_entity_id":"z","p_metadata":{}}),
]
mal=0
for n,q,f,c in casos:
    cod,cu=post(q,f,c)
    existe = not (isinstance(cu,dict) and cu.get("code") in ("PGRST202",))
    msg = (cu.get("message") if isinstance(cu,dict) else f"{len(cu) if isinstance(cu,list) else cu} filas")
    print(("OK   " if existe else "FALLA"), cod, n, "→", str(msg)[:90])
    mal += (not existe)
print("\nResultado:", "las funciones se encuentran con los nombres que usa la web" if mal==0 else f"{mal} función(es) no encontrada(s)")
